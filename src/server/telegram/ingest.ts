import { TG_PREFIX } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { getTelegramCredentialsByBotId } from "@/server/telegram/credentials";

/**
 * Telegram inbound. The webhook route wraps Telegram's Update with the bot id
 * from its URL (`{ botId, update }`): an Update doesn't say which bot it was
 * sent to, and the bot id is what routes it to an organization.
 *
 * Only private chats with the bot are ingested; groups and channels are
 * ignored. The normalizer is pure so it can be tested without a database.
 */

export type TelegramWebhookPayload = { botId: string; update: TelegramUpdate };

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  video_note?: unknown;
  voice?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
  location?: unknown;
  contact?: unknown;
};

export type TelegramUpdate = { update_id: number; message?: TelegramMessage };

export type TelegramInbound = {
  botId: string;
  chatId: string;
  messageId: string;
  text: string | null;
  /** text | image | video | audio | document | sticker | location | contacts | unsupported */
  type: string;
  /** Seconds since epoch, as the ingest core expects. */
  timestamp: string;
  profileName: string | null;
};

function tipoDe(m: TelegramMessage): string {
  if (m.text) return "text";
  if (m.photo) return "image";
  if (m.video || m.video_note) return "video";
  if (m.voice || m.audio) return "audio";
  if (m.document) return "document";
  if (m.sticker) return "sticker";
  if (m.location) return "location";
  if (m.contact) return "contacts";
  return "unsupported";
}

export function normalizeTelegramPayload(payload: unknown): TelegramInbound[] {
  const p = payload as Partial<TelegramWebhookPayload> | null;
  const m = p?.update?.message;
  if (!p?.botId || !m || typeof m.message_id !== "number") return [];
  if (m.chat?.type !== "private") return [];
  if (m.from?.is_bot) return [];

  const nombre = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ").trim();
  const text = m.text ?? m.caption ?? null;
  return [
    {
      botId: p.botId,
      chatId: String(m.chat.id),
      // message_id is only unique within a chat: prefix with bot and chat.
      messageId: `tg_${p.botId}_${m.chat.id}_${m.message_id}`,
      text: text && text.length > 0 ? text : null,
      type: tipoDe(m),
      timestamp: String(m.date),
      profileName: nombre || (m.from?.username ? `@${m.from.username}` : null),
    },
  ];
}

export async function processTelegramPayload(payload: unknown): Promise<void> {
  for (const evt of normalizeTelegramPayload(payload)) {
    const creds = await getTelegramCredentialsByBotId(evt.botId);
    if (!creds) {
      console.warn(
        `[telegram] update for an unknown bot (${evt.botId}): ` +
          "connect it in Settings → Telegram to receive messages"
      );
      continue;
    }
    await ingestInboundMessage({
      organizationId: creds.organizationId,
      identity: {
        identity: `${TG_PREFIX}${evt.chatId}`,
        channel: "telegram",
        phone: null,
        waUserId: null,
        profileName: evt.profileName,
      },
      waMessageId: evt.messageId,
      type: evt.type,
      text: evt.text,
      timestamp: evt.timestamp,
      threadRef: evt.chatId,
    });
  }
}
