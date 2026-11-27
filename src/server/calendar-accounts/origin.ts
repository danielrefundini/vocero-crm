import { getEnv } from "@/lib/env";

/**
 * The CRM address the person is using (it can have more than one). Google
 * sends them back to the same one, where their sign-in cookie lives. Anything
 * not on the trusted list falls back to APP_BASE_URL. Each address must be an
 * authorized redirect URI in the Google Cloud OAuth client.
 */
export function crmOrigin(req: Request): string {
  const env = getEnv();
  const base = new URL(env.APP_BASE_URL).origin;
  const allowed = new Set(
    [base, ...(env.AUTH_TRUSTED_ORIGINS ?? "").split(",")]
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return allowed.has(origin) ? origin : base;
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/calendar/google/callback`;
}

export const STATE_COOKIE = "gcal_oauth";

export function stateCookie(value: string, origin: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; Path=/api/calendar/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    origin.startsWith("https://") ? "; Secure" : ""
  }`;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function redirectTo(location: string, cookie?: string): Response {
  const headers = new Headers({ location });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
