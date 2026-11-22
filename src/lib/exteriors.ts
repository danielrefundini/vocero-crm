/**
 * Campos del negocio de exteriores (Daniel Exteriors / Presidential Exteriors).
 * Puro: lo usan la API, la bandeja y las pruebas sin tocar la base.
 */

export const SERVICE_TYPES = [
  "windows",
  "roofing",
  "siding",
  "doors",
  "gutters",
  "attic_insulation",
  "decks",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABEL: Record<ServiceType, string> = {
  windows: "Windows",
  roofing: "Roofing",
  siding: "Siding",
  doors: "Doors",
  gutters: "Gutters",
  attic_insulation: "Attic insulation",
  decks: "Decks",
};

export const BRANDS = ["daniel_exteriors", "presidential_exteriors"] as const;
export type Brand = (typeof BRANDS)[number];

export const BRAND_LABEL: Record<Brand, string> = {
  daniel_exteriors: "Daniel Exteriors",
  presidential_exteriors: "Presidential Exteriors",
};

export const DEFAULT_BRAND: Brand = "daniel_exteriors";

/** Estados y DC. El CRM es para el DMV; el resto de EE. UU. también cabe. */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export const EMAIL_PREFIX = "email:";
export const SMS_PREFIX = "sms:";

export type AddressParts = {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type AddressFieldError = { field: "state" | "zip"; message: string };

const ALIASES: Record<string, ServiceType> = {
  window: "windows",
  windows: "windows",
  roof: "roofing",
  roofs: "roofing",
  roofing: "roofing",
  siding: "siding",
  door: "doors",
  doors: "doors",
  gutter: "gutters",
  gutters: "gutters",
  "gutter guard": "gutters",
  "gutter guards": "gutters",
  attic: "attic_insulation",
  "attic insulation": "attic_insulation",
  insulation: "attic_insulation",
  deck: "decks",
  decks: "decks",
};

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && (SERVICE_TYPES as readonly string[]).includes(value);
}

export function isBrand(value: unknown): value is Brand {
  return typeof value === "string" && (BRANDS as readonly string[]).includes(value);
}

export function parseBrand(value: unknown): Brand | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return null;
  if (s === "presidential exteriors" || s === "presidential") return "presidential_exteriors";
  if (s === "daniel exteriors" || s === "daniel") return "daniel_exteriors";
  if (isBrand(value.trim())) return value.trim() as Brand;
  return null;
}

function blankToNull(value: string | null | undefined, max = 200): string | null {
  const t = (value ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export function normalizeState(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (!(US_STATE_CODES as readonly string[]).includes(s)) return null;
  return s;
}

export function normalizeZip(raw: string): string | null {
  const z = raw.trim();
  if (!z) return null;
  return /^\d{5}(?:-\d{4})?$/.test(z) ? z : null;
}

export function validateAddressInput(input: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): { ok: true; address: AddressParts } | { ok: false; error: AddressFieldError } {
  const stateRaw = (input.state ?? "").trim();
  const zipRaw = (input.zip ?? "").trim();
  let state: string | null = null;
  if (stateRaw) {
    state = normalizeState(stateRaw);
    if (!state) {
      return {
        ok: false,
        error: { field: "state", message: "State must be a 2-letter US code (for example MD)." },
      };
    }
  }
  let zip: string | null = null;
  if (zipRaw) {
    zip = normalizeZip(zipRaw);
    if (!zip) {
      return {
        ok: false,
        error: {
          field: "zip",
          message: "ZIP must be 5 digits or ZIP+4 (12345 or 12345-6789).",
        },
      };
    }
  }
  return {
    ok: true,
    address: {
      street: blankToNull(input.street),
      city: blankToNull(input.city, 120),
      state,
      zip,
    },
  };
}

export function formatAddress(address: AddressParts): string {
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  const cityLine = [address.city, stateZip].filter(Boolean).join(", ");
  return [address.street, cityLine].filter(Boolean).join(", ");
}

/** Enlace de búsqueda. No llama a una API de pago. */
export function googleMapsSearchUrl(address: string | null | undefined): string | null {
  const q = (address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function serviceChunks(input: unknown): string[] {
  if (input == null) return [];
  if (Array.isArray(input)) return input.flatMap(serviceChunks);
  if (typeof input !== "string") return [];
  return input
    .split(/\s*(?:,|\/|&|\+|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Acepta un string o una lista. Variantes habituales (`window`, `gutter guards`)
 * se normalizan. Lo que no está en la lista no tumba el alta: vuelve en
 * `unrecognized` para anotarlo.
 */
export function mapServices(input: unknown): {
  services: ServiceType[];
  unrecognized: string[];
} {
  const services: ServiceType[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<ServiceType>();
  for (const chunk of serviceChunks(input)) {
    const key = chunk.toLowerCase().replace(/\s+/g, " ");
    const hit = ALIASES[key];
    if (!hit) {
      unrecognized.push(chunk);
      continue;
    }
    if (!seen.has(hit)) {
      seen.add(hit);
      services.push(hit);
    }
  }
  return { services, unrecognized };
}

export function unrecognizedServiceNote(parts: readonly string[]): string | null {
  if (parts.length === 0) return null;
  return `[Unrecognized service] ${parts.join("; ")}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function emailIdentity(email: string): string {
  return `${EMAIL_PREFIX}${email}`;
}

export function smsIdentity(phone: string): string {
  return `${SMS_PREFIX}${phone}`;
}

/**
 * Teléfono de EE. UU. para altas manuales, la web y SMS.
 * 10 dígitos se leen como nacionales y se les antepone el 1.
 * Un 521… de 13 dígitos se deja en 52… para no partir un contacto mexicano
 * que alguien pegue con el prefijo viejo de WhatsApp.
 */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (/^521\d{10}$/.test(digits)) return `52${digits.slice(3)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function toE164(normalized: string): string {
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function servicesFromStored(value: unknown): ServiceType[] {
  if (!Array.isArray(value)) return [];
  const out: ServiceType[] = [];
  for (const item of value) {
    if (isServiceType(item) && !out.includes(item)) out.push(item);
  }
  return out;
}
