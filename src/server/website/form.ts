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
  /**
   * The project details the card has no field for (option chosen, size, what's
   * going on, timeline...), one "Label: value" per line, for the contact notes.
   * Absent on leads stored before this existed.
   */
  notes?: string[];
  /** The form showed the visitor a price range, so the deal counts as quoted. */
  quoted?: boolean;
};

/** Form keys that fill the contact card's address and services. */
const DETAIL_KEYS: Record<string, string[]> = {
  address_street: [
    "address",
    "street",
    "street_address",
    "address_street",
    "address_line_1",
    "property_address",
  ],
  address_city: ["city", "town", "address_city"],
  address_state: ["state", "address_state", "region"],
  address_zip: ["zip", "zip_code", "zipcode", "postal_code", "address_zip"],
  services: ["service", "services", "service_type", "project", "project_type", "interested_in"],
};

/** Form keys copied to the contact notes, in this order. */
const NOTE_KEYS = [
  "request",
  "appointment",
  "option_chosen",
  "size_and_details",
  "what's_going_on",
  "whats_going_on",
  "issues",
  "timeline",
  "range_shown",
];
const RANGE_KEYS = ["range_shown", "price_range", "estimate"];

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
  // A one-line address ("18723 Purple Martin Ln, Montgomery Village, MD 20879")
  // fills street, city, state and ZIP; a separate ZIP field still wins.
  if (details.address_street) {
    const parts = splitUsAddress(details.address_street);
    if (parts) {
      details.address_street = parts.street;
      if (!details.address_city) details.address_city = parts.city;
      if (parts.state && !details.address_state) details.address_state = parts.state;
      if (parts.zip && !details.address_zip) details.address_zip = parts.zip;
    }
  }

  const notes: string[] = [];
  for (const k of NOTE_KEYS) {
    const hit = valores.get(k);
    if (hit) notes.push(`${etiqueta(hit.key)}: ${hit.value}`);
  }
  const range = primero(RANGE_KEYS);
  const quoted = Boolean(range && /\$\s*\d/.test(range.value));

  return {
    name,
    email,
    phone,
    details,
    notes,
    quoted,
    text: lineas.join("\n"),
    messageId: `web_${huella}`,
    identity,
    formId: typeof b.form === "string" ? b.form : null,
  };
}

/**
 * "street, city, ST 12345" (ZIP and state optional) → its parts. Null when the
 * text doesn't have at least a street and a city, so it stays as the street.
 */
export function splitUsAddress(
  text: string
): { street: string; city: string; state: string | null; zip: string | null } | null {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 2 && /^(usa|us|united states)$/i.test(parts[parts.length - 1] ?? "")) parts.pop();
  if (parts.length < 2) return null;
  let state: string | null = null;
  let zip: string | null = null;
  let last = parts[parts.length - 1] ?? "";
  const zipMatch = last.match(/\s*(\d{5})(?:-\d{4})?$/);
  if (zipMatch) {
    zip = zipMatch[1] ?? null;
    last = last.slice(0, zipMatch.index).trim();
  }
  const stateMatch = last.match(/^(.*?)\s*\b([A-Za-z]{2})$/);
  if (stateMatch && parts.length >= 3 && !stateMatch[1]) {
    // "..., City, MD 20879": the last part is only the state.
    state = (stateMatch[2] ?? "").toUpperCase();
    parts.pop();
  } else if (stateMatch && stateMatch[1]) {
    // "..., City MD 20879": city and state share the last part.
    state = (stateMatch[2] ?? "").toUpperCase();
    parts[parts.length - 1] = stateMatch[1].trim();
  } else if (!last) {
    parts.pop();
  } else {
    parts[parts.length - 1] = last;
  }
  if (parts.length < 2) return null;
  const city = parts.pop()!;
  return { street: parts.join(", "), city, state, zip };
}

/** Today's date (YYYY-MM-DD) in the business's time zone. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
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
  if (lead.quoted) fields.quote_date = todayIn("America/New_York");
  await applyStructuredFields({ organizationId, contactId: c.id, fields, servicesMode: "merge" }).catch(
    (err) => console.error("[website] couldn't fill the contact card:", err)
  );
  // Everything else the form asked goes to the contact notes, under a dated
  // heading, after whatever is already there. A retried delivery adds nothing.
  if (lead.notes?.length) {
    const block = [`Website form, ${todayIn("America/New_York")}:`, ...lead.notes].join("\n");
    const [row] = await db
      .select({ notes: schema.contact.notes })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, c.id)))
      .limit(1);
    const prev = row?.notes ?? "";
    const body = lead.notes.join("\n");
    if (!prev.includes(body)) {
      await db
        .update(schema.contact)
        .set({ notes: prev ? `${prev}\n\n${block}` : block, updatedAt: new Date() })
        .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, c.id)));
    }
  }
  if (lead.phone && !c.phone) {
    await db
      .update(schema.contact)
      .set({ phone: lead.phone, updatedAt: new Date() })
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, c.id)));
  }
}
