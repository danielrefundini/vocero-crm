import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  DEFAULT_BRAND,
  formatAddress,
  isBrand,
  isIsoDate,
  mapServices,
  normalizeEmail,
  parseBrand,
  servicesFromStored,
  unrecognizedServiceNote,
  validateAddressInput,
  type AddressParts,
  type Brand,
  type ServiceType,
} from "@/lib/exteriors";
import { parseMoneyToCents } from "@/lib/money";

/**
 * Lo que el cerebro manda dentro de la ficha y que en este negocio ya tiene
 * columna. Se saca del parche de la ficha (el resto sigue el merge de siempre)
 * y se escribe en contacto y lead.
 */
const FICHA_KEYS = [
  "email",
  "address_street",
  "addressStreet",
  "street",
  "address_city",
  "addressCity",
  "city",
  "address_state",
  "addressState",
  "state",
  "address_zip",
  "addressZip",
  "zip",
  "services",
  "service",
  "quote_amount",
  "quoteAmount",
  "amount",
  "amount_cents",
  "quote_date",
  "quoteDate",
  "brand",
] as const;

export function splitStructuredFicha(ficha: Record<string, unknown>): {
  structured: Record<string, unknown>;
  ficha: Record<string, unknown>;
} {
  const structured: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  const known = new Set<string>(FICHA_KEYS);
  for (const [key, value] of Object.entries(ficha)) {
    if (known.has(key)) structured[key] = value;
    else rest[key] = value;
  }
  return { structured, ficha: rest };
}

function firstString(
  bag: Record<string, unknown>,
  keys: readonly string[]
): string | null | undefined {
  for (const key of keys) {
    if (!(key in bag)) continue;
    const value = bag[key];
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export async function applyStructuredFields(input: {
  organizationId: string;
  contactId: string;
  fields: Record<string, unknown>;
  /** La UI manda la lista completa. La ficha del agente suma. */
  servicesMode?: "replace" | "merge";
}): Promise<void> {
  if (Object.keys(input.fields).length === 0) return;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        eq(schema.contact.id, input.contactId)
      )
    )
    .limit(1);
  const contact = rows[0];
  if (!contact) return;

  const contactSet: Record<string, unknown> = {};
  const email = firstString(input.fields, ["email"]);
  if (email !== undefined) {
    contactSet.email = email === null ? null : normalizeEmail(email);
  }

  const street = firstString(input.fields, ["address_street", "addressStreet", "street"]);
  const city = firstString(input.fields, ["address_city", "addressCity", "city"]);
  const state = firstString(input.fields, ["address_state", "addressState", "state"]);
  const zip = firstString(input.fields, ["address_zip", "addressZip", "zip"]);
  if (street !== undefined || city !== undefined || state !== undefined || zip !== undefined) {
    const checked = validateAddressInput({
      street: street === undefined ? contact.addressStreet : street,
      city: city === undefined ? contact.addressCity : city,
      state: state === undefined ? contact.addressState : state,
      zip: zip === undefined ? contact.addressZip : zip,
    });
    if (checked.ok) {
      contactSet.addressStreet = checked.address.street;
      contactSet.addressCity = checked.address.city;
      contactSet.addressState = checked.address.state;
      contactSet.addressZip = checked.address.zip;
    }
  }

  if ("services" in input.fields || "service" in input.fields) {
    const mapped = mapServices(input.fields.services ?? input.fields.service);
    const mode = input.servicesMode ?? "merge";
    const next =
      mode === "replace"
        ? mapped.services
        : unionServices(servicesFromStored(contact.services), mapped.services);
    contactSet.services = next;
    const note = unrecognizedServiceNote(mapped.unrecognized);
    if (note) contactSet.notes = appendNote(contact.notes, note);
  }

  if (Object.keys(contactSet).length > 0) {
    contactSet.updatedAt = new Date();
    await db
      .update(schema.contact)
      .set(contactSet)
      .where(eq(schema.contact.id, contact.id));
  }

  const leadSet = leadPatch(input.fields);
  if (Object.keys(leadSet).length === 0) return;
  leadSet.updatedAt = new Date();
  await db
    .update(schema.lead)
    .set(leadSet)
    .where(
      scoped(
        schema.lead.organizationId,
        input.organizationId,
        eq(schema.lead.contactId, contact.id)
      )
    );
}

function unionServices(current: ServiceType[], incoming: ServiceType[]): ServiceType[] {
  const out = [...current];
  for (const service of incoming) {
    if (!out.includes(service)) out.push(service);
  }
  return out;
}

function appendNote(prev: string | null, line: string): string {
  if (!prev) return line;
  if (prev.includes(line)) return prev;
  return `${prev}\n${line}`;
}

function leadPatch(fields: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if ("amount_cents" in fields) {
    const cents = fields.amount_cents;
    if (cents === null) {
      set.amountCents = null;
      set.currency = null;
    } else if (typeof cents === "number" && Number.isInteger(cents) && cents >= 0) {
      set.amountCents = cents;
      set.currency = "USD";
    }
  } else if ("quote_amount" in fields || "quoteAmount" in fields || "amount" in fields) {
    const raw = fields.quote_amount ?? fields.quoteAmount ?? fields.amount;
    if (raw === null || raw === "") {
      set.amountCents = null;
      set.currency = null;
    } else {
      const cents =
        typeof raw === "number" && Number.isFinite(raw)
          ? Math.round(raw * 100)
          : typeof raw === "string"
            ? parseMoneyToCents(raw)
            : null;
      if (cents !== null) {
        set.amountCents = cents;
        set.currency = "USD";
      }
    }
  }

  if ("quote_date" in fields || "quoteDate" in fields) {
    const raw = fields.quote_date ?? fields.quoteDate;
    if (raw === null || raw === "") set.quoteDate = null;
    else if (typeof raw === "string" && isIsoDate(raw)) set.quoteDate = raw;
  }

  if ("brand" in fields) {
    if (fields.brand === null || fields.brand === "") set.brand = null;
    else {
      const brand = isBrand(fields.brand) ? fields.brand : parseBrand(fields.brand);
      if (brand) set.brand = brand;
    }
  }
  return set;
}

export function addressOf(contact: {
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
}): AddressParts {
  return {
    street: contact.addressStreet,
    city: contact.addressCity,
    state: contact.addressState,
    zip: contact.addressZip,
  };
}

export function formattedAddressOf(contact: {
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
}): string {
  return formatAddress(addressOf(contact));
}

export function brandOrDefault(value: string | null | undefined): Brand {
  return value && isBrand(value) ? value : DEFAULT_BRAND;
}
