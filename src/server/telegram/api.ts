/**
 * Telegram Bot API client: the only module that talks to Telegram.
 *
 * Every call is `POST https://api.telegram.org/bot<token>/<method>` with a
 * JSON body; Telegram always answers `{ ok, result | description }`. The base
 * URL can be pointed elsewhere with `TELEGRAM_API_BASE_URL` (tests/mocks).
 * The token is part of the URL, so a URL is never logged.
 */

export class TelegramApiError extends Error {
  /** HTTP status; 0 when Telegram couldn't be reached. */
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
  }

  /** The token is wrong or the bot was deleted/revoked in @BotFather. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 404;
  }

  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Shape check for a bot token: `<numeric id>:<secret>`. */
export const BOT_TOKEN_RE = /^(\d{5,15}):[A-Za-z0-9_-]{30,}$/;

/** The bot's numeric id, which is the part of the token before the colon. */
export function botIdFromToken(token: string): string | null {
  return BOT_TOKEN_RE.exec(token.trim())?.[1] ?? null;
}

function apiBase(): string {
  return (process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org").replace(/\/$/, "");
}

export async function telegramCall<T>(
  token: string,
  method: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TelegramApiError("Couldn't reach Telegram", 0);
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string }
    | null;
  if (!res.ok || !data?.ok) {
    throw new TelegramApiError(
      data?.description ?? `Telegram answered ${res.status}`,
      res.status
    );
  }
  return data.result as T;
}

export type TelegramBot = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export function getMe(token: string): Promise<TelegramBot> {
  return telegramCall<TelegramBot>(token, "getMe");
}

export function setWebhook(token: string, url: string, secret: string): Promise<boolean> {
  return telegramCall<boolean>(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

export function deleteWebhook(token: string): Promise<boolean> {
  return telegramCall<boolean>(token, "deleteWebhook");
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<{ message_id: number }> {
  return telegramCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: false },
  });
}
