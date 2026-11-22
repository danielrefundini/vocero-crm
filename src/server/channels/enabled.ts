import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { CHANNEL_ORDER, isChannel, type Channel } from "@/lib/channels";
import { resendOutboundConfig, twilioConfig } from "@/server/follow-up/config";

/**
 * 014 — Qué canales están encendidos en esta instancia.
 *
 * El código de todos los canales viaja siempre en main; lo que decide si
 * existen para el usuario es la variable `CHANNELS`. Una instalación normal
 * (`CHANNELS=whatsapp`, el default) no ve Instagram por ningún lado: ni
 * pantalla, ni webhook, ni variables que llenar.
 *
 * Se hace así, y no con una rama por feature, porque una rama tiene que
 * mantenerse compatible con main Y con las demás ramas opcionales, y su
 * cadena de migraciones diverge sin arreglo posible. Con la bandera hay UNA
 * cadena de migraciones para todo el mundo y los conflictos los resuelve el
 * autor una vez, no cada usuario en cada actualización.
 *
 * La migración se aplica siempre: una columna con default y una tabla vacía
 * son inertes, y a cambio todas las instancias tienen la misma estructura.
 */

/** WhatsApp no se puede apagar: es el canal por el que existe el producto. */
const ALWAYS_ON: Channel = "whatsapp";

/** Values that turn TELEGRAM on. Anything else, off. */
const ON_VALUES = new Set(["on", "1", "true", "yes", "si", "sí"]);

export function parseTelegramFlag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

/**
 * Telegram doesn't go through CHANNELS: it has its own switch (`TELEGRAM=on`),
 * so it can stay off while the Zernio channels are on, and the other way
 * round. "telegram" written inside CHANNELS is ignored.
 */
export function parseChannels(
  raw: string | undefined,
  telegram?: string | undefined,
  website?: string | undefined
): Set<Channel> {
  const enabled = new Set<Channel>([ALWAYS_ON]);
  if (parseTelegramFlag(telegram)) enabled.add("telegram");
  // Website forms have their own switch too (WEBSITE_FORMS=on).
  if (parseTelegramFlag(website)) enabled.add("website");
  for (const part of (raw ?? "").split(",")) {
    const name = part.trim().toLowerCase();
    if (name === "telegram" || name === "website" || KEY_CHANNELS.includes(name as Channel)) continue;
    // Cualquier canal del catalogo, no una lista escrita a mano aqui: el
    // canal siguiente solo tiene que existir en lib/channels.ts.
    if (isChannel(name)) enabled.add(name);
  }
  return enabled;
}

/** What the environment variables say, before anything saved in Settings. */
export function envChannels(): Set<Channel> {
  const env = getEnv();
  return parseChannels(env.CHANNELS, env.TELEGRAM, env.WEBSITE_FORMS);
}

/**
 * SMS (Twilio) and email (Resend) exist when their keys are set, not by a
 * switch: without the keys there's nothing to turn on.
 */
const KEY_CHANNELS: readonly Channel[] = ["sms", "email"];

/** The channels the owner can switch from Settings (WhatsApp can't). */
export const SWITCHABLE_CHANNELS: readonly Channel[] = CHANNEL_ORDER.filter(
  (c) => c !== ALWAYS_ON && !KEY_CHANNELS.includes(c)
);

/** SMS and email, on when their keys are in the environment. */
function keyChannels(): Channel[] {
  const on: Channel[] = [];
  if (twilioConfig()) on.push("sms");
  if (resendOutboundConfig()) on.push("email");
  return on;
}

const SETTING_KEY = "channels";

/**
 * The saved choice, read again at most every few seconds per server instance:
 * every request asks, and on serverless a save in one instance has to reach
 * the others without a redeploy.
 */
const CACHE_MS = 5_000;
const globalForChannels = globalThis as unknown as {
  __voceroChannels?: { at: number; value: Channel[] | null };
};

/** Turns a stored value into a list of known channels; anything else, null. */
export function parseSavedChannels(value: unknown): Channel[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is Channel => typeof v === "string" && isChannel(v));
}

async function savedChannels(): Promise<Channel[] | null> {
  const hit = globalForChannels.__voceroChannels;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: Channel[] | null = null;
  try {
    const [row] = await getDb()
      .select({ value: schema.instanceSetting.value })
      .from(schema.instanceSetting)
      .where(eq(schema.instanceSetting.key, SETTING_KEY))
      .limit(1);
    value = parseSavedChannels(row?.value);
  } catch (err) {
    // Without the table (migration not applied yet) or the database, the
    // env vars decide: a channel switch must never take the CRM down.
    console.error("[channels] couldn't read the saved channels:", err);
    if (hit) return hit.value;
  }
  globalForChannels.__voceroChannels = { at: Date.now(), value };
  return value;
}

/**
 * Combines the saved choice with the env vars: with something saved in
 * Settings, that wins; without it, the env vars. WhatsApp is always on.
 */
export function resolveChannels(saved: Channel[] | null, fromEnv: Set<Channel>): Set<Channel> {
  if (saved === null) return new Set(fromEnv);
  return new Set<Channel>([ALWAYS_ON, ...saved]);
}

export async function enabledChannels(): Promise<Set<Channel>> {
  const on = resolveChannels(await savedChannels(), envChannels());
  for (const c of keyChannels()) on.add(c);
  return on;
}

export async function isChannelEnabled(channel: Channel): Promise<boolean> {
  return (await enabledChannels()).has(channel);
}

/** Saves which channels are on (from Settings). WhatsApp is ignored: always on. */
export async function saveEnabledChannels(channels: readonly Channel[]): Promise<Set<Channel>> {
  const value = SWITCHABLE_CHANNELS.filter((c) => channels.includes(c));
  await getDb()
    .insert(schema.instanceSetting)
    .values({ key: SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.instanceSetting.key,
      set: { value, updatedAt: new Date() },
    });
  globalForChannels.__voceroChannels = { at: Date.now(), value };
  const on = resolveChannels(value, envChannels());
  for (const c of keyChannels()) on.add(c);
  return on;
}

/**
 * Respuesta para una superficie de un canal apagado. 404 y no 403 a
 * propósito: si el canal no está encendido, ese endpoint no existe en esta
 * instancia — no hay nada que revelar sobre él.
 */
export function channelDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
