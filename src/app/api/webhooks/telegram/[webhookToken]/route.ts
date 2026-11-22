import { getEnv } from "@/lib/env";
import { isValidWebhookToken } from "@/server/inbox/webhook";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import {
  getTelegramCredentialsByBotId,
  isValidTelegramSecret,
} from "@/server/telegram/credentials";
import { recibirEvento } from "@/server/webhooks/recibir";

/**
 * Public webhook of the Telegram channel. Three checks before anything is
 * stored:
 * 1. The [webhookToken] segment must match (otherwise 404, no side effects).
 * 2. `?bot=<id>` must be a connected bot.
 * 3. `X-Telegram-Bot-Api-Secret-Token` must equal the secret this CRM gave
 *    Telegram in setWebhook. Without it, anyone who knows the URL could
 *    inject fake messages and make the agent reply for real.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!(await isChannelEnabled("telegram"))) return channelDisabledResponse();
  const { webhookToken } = await params;
  if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  const botId = new URL(req.url).searchParams.get("bot") ?? "";
  const creds = /^\d+$/.test(botId) ? await getTelegramCredentialsByBotId(botId) : null;
  if (!creds) return new Response(null, { status: 404 });
  if (
    !isValidTelegramSecret(
      creds.webhookSecret,
      req.headers.get("x-telegram-bot-api-secret-token")
    )
  ) {
    return new Response(null, { status: 401 });
  }

  const rawBody = await req.text();
  let update: unknown;
  try {
    update = JSON.parse(rawBody);
  } catch {
    // Unreadable body: 200 anyway so Telegram doesn't retry in vain.
    return Response.json({ received: true });
  }

  // Store, acknowledge right away and process outside the route (a failure
  // is retried by the sweep), same as every other channel.
  return recibirEvento("telegram", { botId, update }, rawBody, "telegram");
}
