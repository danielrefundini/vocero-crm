import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import {
  botIdFromToken,
  deleteWebhook,
  getMe,
  setWebhook,
  TelegramApiError,
} from "@/server/telegram/api";
import {
  deleteTelegramCredentials,
  getTelegramCredentialsByBotId,
  getTelegramCredentialsByOrg,
  saveTelegramCredentials,
  tokenLast4,
} from "@/server/telegram/credentials";
import { webhookUrl } from "@/server/whatsapp/webhook-url";

export const dynamic = "force-dynamic";

/** Where Telegram delivers this bot's messages. */
function telegramWebhookUrl(botId: string): string {
  return `${webhookUrl("telegram")}?bot=${botId}`;
}

/** Connection state of the Telegram bot (the token never leaves whole). */
export const GET = withAuth(async (session) => {
  if (!(await isChannelEnabled("telegram"))) return channelDisabledResponse();
  const creds = await getTelegramCredentialsByOrg(session.organizationId);
  if (!creds) return Response.json({ connection: null, canManage: session.role === "owner" });
  return Response.json({
    canManage: session.role === "owner",
    connection: {
      botId: creds.botId,
      botUsername: creds.botUsername,
      botName: creds.botName,
      status: creds.status,
      tokenLast4: tokenLast4(creds.token),
    },
  });
});

const putSchema = z.object({ token: z.string().trim().min(1).max(200) });

/**
 * Connects a bot: the token is checked against Telegram (getMe) BEFORE it's
 * saved, then the webhook is registered with a fresh secret. If Telegram
 * rejects the webhook (it requires a public HTTPS address) the bot stays
 * saved and the response says why messages won't arrive yet.
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (!(await isChannelEnabled("telegram"))) return channelDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can connect Telegram");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const token = body.data.token;

  const botId = botIdFromToken(token);
  if (!botId) {
    return apiError(
      422,
      "invalid_token",
      "That doesn't look like a bot token. It's the line @BotFather gives you, like 123456789:AAH…"
    );
  }

  let bot;
  try {
    bot = await getMe(token);
  } catch (err) {
    if (err instanceof TelegramApiError && err.isAuthError) {
      return apiError(422, "invalid_token", "Telegram rejected that token. Copy it again from @BotFather.");
    }
    return apiError(503, "telegram_unavailable", "Couldn't reach Telegram right now. Try again in a moment.");
  }
  if (String(bot.id) !== botId) {
    return apiError(422, "invalid_token", "Telegram rejected that token. Copy it again from @BotFather.");
  }

  const previa = await getTelegramCredentialsByOrg(session.organizationId);
  // Another organization already uses this bot: one bot, one inbox.
  if (!previa || previa.botId !== botId) {
    const otro = await getTelegramCredentialsByBotId(botId);
    if (otro && otro.organizationId !== session.organizationId) {
      return apiError(409, "bot_in_use", "This bot is already connected to another workspace.");
    }
  }

  const webhookSecret = randomBytes(32).toString("hex");
  await saveTelegramCredentials({
    organizationId: session.organizationId,
    botId,
    botUsername: bot.username ?? null,
    botName: bot.first_name ?? null,
    token,
    webhookSecret,
  });

  // A different bot replaced: stop the old one from delivering here.
  if (previa && previa.botId !== botId) {
    await deleteWebhook(previa.token).catch(() => null);
  }

  let webhook: { ok: true } | { ok: false; message: string };
  try {
    await setWebhook(token, telegramWebhookUrl(botId), webhookSecret);
    webhook = { ok: true };
  } catch (err) {
    webhook = {
      ok: false,
      message:
        err instanceof TelegramApiError
          ? `Telegram didn't accept the webhook: ${err.message}. Messages will arrive once this CRM runs on a public HTTPS address (APP_BASE_URL); then save the token again.`
          : "Couldn't register the webhook with Telegram. Save the token again to retry.",
    };
  }

  return Response.json({
    ok: true,
    botUsername: bot.username ?? null,
    botName: bot.first_name ?? null,
    webhook,
  });
});

/** Disconnects the bot: Telegram stops delivering and the token is erased. */
export const DELETE = withAuth(async (session) => {
  if (!(await isChannelEnabled("telegram"))) return channelDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can disconnect Telegram");
  }
  const creds = await getTelegramCredentialsByOrg(session.organizationId);
  if (creds) {
    await deleteWebhook(creds.token).catch(() => null);
    await deleteTelegramCredentials(session.organizationId);
  }
  return Response.json({ ok: true });
});
