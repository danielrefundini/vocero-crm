import { timingSafeEqual } from "node:crypto";

/**
 * `WEBSITE_FORM_ALLOWLIST`: lista JSON de ids de formulario o de orígenes
 * (`["daniel-exteriors","https://danielexteriors.com"]`), o una lista
 * separada por comas si no es JSON. Vacío = cualquier formulario, con el
 * token igual de obligatorio. Una forma que no entendemos no abre la puerta:
 * se rechaza, y el mensaje de error dice cómo escribirla.
 */
export function parseWebsiteForms(raw: string | undefined): string[] | null {
  const value = raw?.trim();
  if (!value) return [];
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        return null;
      }
      return parsed.map((item) => item.trim()).filter(Boolean);
    } catch {
      return null;
    }
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function websiteFormAllowed(input: {
  formsRaw: string | undefined;
  formId: string | null;
  origin: string | null;
}): { ok: true } | { ok: false; reason: "malformed" | "rejected" } {
  const forms = parseWebsiteForms(input.formsRaw);
  if (forms === null) return { ok: false, reason: "malformed" };
  if (forms.length === 0) return { ok: true };
  const formId = input.formId?.trim().toLowerCase() ?? "";
  const origin = normalizeOrigin(input.origin);
  const ok = forms.some((entry) => {
    const needle = entry.trim().toLowerCase().replace(/\/$/, "");
    if (formId && needle === formId) return true;
    if (!origin) return false;
    return needle === origin || needle === originHost(origin);
  });
  return ok ? { ok: true } : { ok: false, reason: "rejected" };
}

function normalizeOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return url.origin.toLowerCase();
  } catch {
    return origin.trim().toLowerCase().replace(/\/$/, "") || null;
  }
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return origin;
  }
}

export function tokensMatch(provided: string | null, expected: string | undefined): boolean {
  const want = expected?.trim() ?? "";
  const got = provided?.trim() ?? "";
  if (!want || !got) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function websiteTokenFrom(req: Request): string | null {
  const header = req.headers.get("x-website-form-token")?.trim();
  if (header) return header;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return null;
}
