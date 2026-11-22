import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Telegram channel credentials. Same contract as the other channels: the bot
 * token and the webhook secret only exist decrypted in memory and never leave
 * in an API response (outward, only the token's last 4 characters).
 */

export type TelegramCredentials = {
  id: string;
  organizationId: string;
  botId: string;
  botUsername: string | null;
  botName: string | null;
  status: "connected" | "reconnect_required";
  token: string;
  webhookSecret: string;
};

type Row = typeof schema.telegramCredentials.$inferSelect;

function toCredentials(row: Row): TelegramCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    botId: row.botId,
    botUsername: row.botUsername,
    botName: row.botName,
    status: row.status,
    token: decryptSecret({ cipher: row.tokenCipher, iv: row.tokenIv, tag: row.tokenTag }),
    webhookSecret: decryptSecret({
      cipher: row.webhookSecretCipher,
      iv: row.webhookSecretIv,
      tag: row.webhookSecretTag,
    }),
  };
}

export async function getTelegramCredentialsByOrg(
  organizationId: string
): Promise<TelegramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Webhook routing: the URL carries the bot id. */
export async function getTelegramCredentialsByBotId(
  botId: string
): Promise<TelegramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.botId, botId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveTelegramCredentials(input: {
  organizationId: string;
  botId: string;
  botUsername: string | null;
  botName: string | null;
  token: string;
  webhookSecret: string;
}): Promise<void> {
  const db = getDb();
  const tok = encryptSecret(input.token);
  const sec = encryptSecret(input.webhookSecret);
  const values = {
    organizationId: input.organizationId,
    botId: input.botId,
    botUsername: input.botUsername,
    botName: input.botName,
    tokenCipher: tok.cipher,
    tokenIv: tok.iv,
    tokenTag: tok.tag,
    webhookSecretCipher: sec.cipher,
    webhookSecretIv: sec.iv,
    webhookSecretTag: sec.tag,
    status: "connected" as const,
    updatedAt: new Date(),
  };
  const existing = await getTelegramCredentialsByOrg(input.organizationId);
  if (existing) {
    await db
      .update(schema.telegramCredentials)
      .set(values)
      .where(eq(schema.telegramCredentials.id, existing.id));
    return;
  }
  await db.insert(schema.telegramCredentials).values({ id: newId("credentials"), ...values });
}

export async function deleteTelegramCredentials(organizationId: string): Promise<void> {
  await getDb()
    .delete(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.organizationId, organizationId));
}

/** The token stopped working: sends pause and Settings asks to reconnect. */
export async function markTelegramReconnectRequired(organizationId: string): Promise<void> {
  await getDb()
    .update(schema.telegramCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.telegramCredentials.organizationId, organizationId));
}

/** Constant-time comparison of the secret Telegram sends back in the header. */
export function isValidTelegramSecret(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenLast4(token: string): string {
  return token.slice(-4);
}
