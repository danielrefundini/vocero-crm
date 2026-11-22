import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { eq } from "drizzle-orm";
import { WEB_PREFIX } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { applyStructuredFields } from "@/server/exteriors/apply";
import { upsertFicha } from "@/server/bot/ficha";
import { resolveInstanceOrg } from "@/server/bot/auth";

/**
 * Website form intake. A submission (Formspree webhook, or the site posting
 * its form straight here) becomes an unread inbox message from a "Website"
 * contact, so the operator gets the same sound, alert and unread badge as a
 * chat. It's a reminder, not a chat: nothing can be sent back on this channel.
 *
 * The normalizer is pure so it can be tested without a database.
 */

export type WebsiteLead = {
  name: string | null;
  email: string | null;
  phone: string | null;
  /** The message as shown in the inbox: every field, one per line. */
  text: string;
  /** Stable per submission, so a retried delivery isn't stored twice. */
  messageId: string;
  /** `web:<email>` or `web:<phone digits>`; null when neither was sent. */
  identity: string | null;
  formId: string | null;
  /** Address and services, when the form asks for them (contact card fields). */
  details: Record<string, string>;
};

/** Form keys that fill the contact card's address and services. */
const DETAIL_KEYS: Record<string, string[]> = {
  address_street: ["address", "street", "street_address", "address_street", "address_line_1"],
  address_city: ["city", "town", "address_city"],
  address_state: ["state", "address_state", "region"],
  address_zip: ["zip", "zip_code", "zipcode", "postal_code", "address_zip"],
  services: ["service", "services", "service_type", "project", "project_type", "interested_in"],
};

const NAME_KEYS = ["name", "full_name", "fullname", "your_name", "nombre"];
const FIRST_KEYS = ["first_name", "firstname", "first"];
const LAST_KEYS = ["last_name", "lastname", "last"];
const EMAIL_KEYS = ["email", "_replyto", "e-mail", "email_address", "your_email"];
const PHONE_KEYS = ["phone", "tel", "telephone", "phone_number", "mobile", "cell", "your_phone"];
const MESSAGE_KEYS = ["message", "comments", "comment", "details", "description", "notes"];

function clave(k: string): string {
  return k.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const parts = v.map(texto).filter((x): x is string => Boolean(x));
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object") return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 2000) : null;
}

function etiqueta(k: string): string {
  const s = k.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Accepts Formspree's webhook body (`{ form, keys, submission: {...} }`) or a
 * plain object of fields (a direct post). Returns null for spam (Formspree's
 * `_gotcha` honeypot filled in) or a submission with nothing in it.
 */
export function normalizeWebsiteForm(body: unknown): WebsiteLead | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const formspree = b.submission && typeof b.submission === "object" && !Array.isArray(b.submission);
  const campos = (formspree ? b.submission : b) as Record<string, unknown>;
  const orden: string[] =
    formspree && Array.isArray(b.keys)
      ? (b.keys as unknown[]).map(String).filter((k) => k in campos)
      : Object.keys(campos);
  for (const k of Object.keys(campos)) if (!orden.includes(k)) orden.push(k);

  if (texto(campos._gotcha)) return null;

  const valores = new Map<string, { key: string; value: string }>();
  for (const k of orden) {
    const v = texto(campos[k]);
    if (v) valores.set(clave(k), { key: k, value: v });
  }
  const primero = (keys: string[]) => {
    for (const k of keys) {
      const hit = valores.get(k);
      if (hit) return hit;
    }
    return null;
  };

  const nombreCompleto = primero(NAME_KEYS);
  const first = primero(FIRST_KEYS);
  const last = primero(LAST_KEYS);
  const name = nombreCompleto?.value ?? ([first?.value, last?.value].filter(Boolean).join(" ") || null);
  const emailHit = primero(EMAIL_KEYS);
  const email = emailHit && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailHit.value) ? emailHit.value.toLowerCase() : null;
  const phoneHit = primero(PHONE_KEYS);
  const phone = phoneHit?.value ?? null;
  const mensaje = primero(MESSAGE_KEYS);

  const usados = new Set(
    [nombreCompleto, first, last, emailHit, phoneHit, mensaje].filter(Boolean).map((h) => clave(h!.key))
  );
  const extras: string[] = [];
  for (const [k, { key, value }] of valores) {
    if (usados.has(k) || key.startsWith("_")) continue;
    extras.push(`${etiqueta(key)}: ${value}`);
  }

  const lineas = [
    "📝 New website form submission",
    name ? `Name: ${name}` : null,
    email ? `Email: ${email}` : emailHit ? `Email: ${emailHit.value}` : null,
    phone ? `Phone: ${phone}` : null,
    ...extras,
    mensaje ? `Message: ${mensaje.value}` : null,
  ].filter((x): x is string => Boolean(x));
  if (lineas.length === 1) return null;

  const digitos = phone ? phone.replace(/\D/g, "") : "";
  const identity = email
    ? `${WEB_PREFIX}${email}`
    : digitos.length >= 7
      ? `${WEB_PREFIX}${digitos}`
      : null;

  const huella = createHash("sha256")
    .update(JSON.stringify([texto(campos._date), ...lineas]))
    .digest("hex")
    .slice(0, 32);

  const details: Record<string, string> = {};
  for (const [field, keys] of Object.entries(DETAIL_KEYS)) {
    const hit = primero(keys);
    if (hit) details[field] = hit.value;
  }

  return {
    name,
    email,
    phone,
    details,
    text: lineas.join("\n"),
    messageId: `web_${huella}`,
    identity,
    formId: typeof b.form === "string" ? b.form : null,
  };
}

/**
 * Formspree signs webhook deliveries: `Formspree-Signature: t=<unix>,v1=<hex>`,
 * HMAC-SHA256 of `<t>.<raw body>` with the webhook's signing secret.
 */
export function isValidFormspreeSignature(
  secret: string,
  header: string | null,
  rawBody: string
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  const esperado = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const recibido = Buffer.from(v1, "hex");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * Processes a stored website event (the route stores the normalized lead, so
 * a retry by the sweep sees exactly what arrived).
 */
export async function processWebsitePayload(payload: unknown): Promise<void> {
  const lead = payload as WebsiteLead | null;
  if (!lead?.messageId || !lead.text) return;
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) throw new Error("No organization yet: the website lead will be retried");
  await ingestWebsiteLead(organizationId, lead);
}

/** Stores the lead as an inbound message and fills in the contact's details. */
export async function ingestWebsiteLead(organizationId: string, lead: WebsiteLead): Promise<void> {
  const identity = lead.identity ?? `${WEB_PREFIX}anon_${lead.messageId.slice(4, 16)}`;
  await ingestInboundMessage({
    organizationId,
    identity: {
      identity,
      channel: "website",
      phone: lead.phone,
      waUserId: null,
      profileName: lead.name ?? lead.email ?? lead.phone ?? "Website visitor",
    },
    waMessageId: lead.messageId,
    type: "text",
    text: lead.text,
    timestamp: String(Math.floor(Date.now() / 1000)),
    threadRef: null,
  });

  // Keep the email and phone on the contact's card, without overwriting
  // anything someone already wrote there. Through upsertFicha, the one door.
  if (!lead.email && !lead.phone) return;
  const db = getDb();
  const [c] = await db
    .select({ id: schema.contact.id, ficha: schema.contact.ficha, phone: schema.contact.phone })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.waIdentity, identity)))
    .limit(1);
  if (!c) return;
  const actual = c.ficha ?? {};
  const patch: Record<string, string> = {};
  if (lead.email && !actual.email) patch.email = lead.email;
  if (lead.phone && !actual.phone) patch.phone = lead.phone;
  if (Object.keys(patch).length) await upsertFicha({ organizationId, contactId: c.id, ficha: patch });
  // Email, address and services go to the card's own fields too. The latest
  // submission updates the email and address; services are added, not replaced.
  const fields: Record<string, unknown> = {};
  if (lead.email) fields.email = lead.email;
  for (const [k, v] of Object.entries(lead.details)) {
    if (k === "services") fields.services = v.split(/\s*(?:,|;|\/|\band\b)\s*/i).filter(Boolean);
    else fields[k] = v;
  }
  await applyStructuredFields({ organizationId, contactId: c.id, fields, servicesMode: "merge" }).catch(
    (err) => console.error("[website] couldn't fill the contact card:", err)
  );
  if (lead.phone && !c.phone) {
    await db
      .update(schema.contact)
      .set({ phone: lead.phone, updatedAt: new Date() })
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, c.id)));
  }
}
