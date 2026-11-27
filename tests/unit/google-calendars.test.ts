import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    BETTER_AUTH_SECRET: "test-secret-for-calendar-state-0123456789",
    APP_BASE_URL: "https://crm.example.test",
    AUTH_TRUSTED_ORIGINS: "https://crm.example.test,https://alt.example.test",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_AUTH_URL: "https://accounts.google.test/o/oauth2/v2/auth",
    GOOGLE_OAUTH_BASE_URL: "https://oauth.google.test",
    GOOGLE_CAL_BASE_URL: "https://cal.google.test/v3",
  }),
}));

import {
  emailFromIdToken,
  eventRange,
  exchangeGoogleCode,
  googleAuthUrl,
  isBusyEvent,
  isCrmEvent,
  signOAuthState,
  verifyOAuthState,
  type GoogleEvent,
} from "@/server/calendar-accounts/google";
import { crmOrigin, googleRedirectUri, readCookie } from "@/server/calendar-accounts/origin";

const who = { organizationId: "org_1", userId: "usr_1", origin: "https://crm.example.test" };

function idToken(payload: object): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OAuth state", () => {
  it("round-trips with the matching cookie nonce", () => {
    const { state, nonce } = signOAuthState(who);
    expect(verifyOAuthState(state, nonce)).toEqual(who);
  });

  it("rejects a different nonce, a tampered payload, or no state", () => {
    const { state, nonce } = signOAuthState(who);
    expect(verifyOAuthState(state, "other")).toBeNull();
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), o: "org_2" })
    ).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, nonce)).toBeNull();
    expect(verifyOAuthState(null, nonce)).toBeNull();
    expect(verifyOAuthState("garbage", nonce)).toBeNull();
  });

  it("expires after 10 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T15:00:00Z"));
    const { state, nonce } = signOAuthState(who);
    vi.setSystemTime(new Date("2026-11-26T15:11:00Z"));
    expect(verifyOAuthState(state, nonce)).toBeNull();
  });
});

describe("Google sign-in URL and code exchange", () => {
  it("asks for offline calendar access and consent", () => {
    const url = new URL(googleAuthUrl({ redirectUri: "https://crm.example.test/cb", state: "s", loginHint: "a@b.test" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.test/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(url.searchParams.get("login_hint")).toBe("a@b.test");
  });

  it("reads the email and refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          refresh_token: "rt",
          scope: "openid email https://www.googleapis.com/auth/calendar.events",
          id_token: idToken({ email: "Owner@Example.test", email_verified: true }),
        })
      )
    );
    await expect(exchangeGoogleCode({ code: "c", redirectUri: "r" })).resolves.toEqual({
      email: "owner@example.test",
      refreshToken: "rt",
    });
  });

  it("refuses when the calendar permission wasn't ticked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ refresh_token: "rt", scope: "openid email", id_token: idToken({ email: "a@b.test" }) }))
    );
    await expect(exchangeGoogleCode({ code: "c", redirectUri: "r" })).rejects.toThrow(/Calendar access/);
  });

  it("emailFromIdToken ignores unverified or broken tokens", () => {
    expect(emailFromIdToken(idToken({ email: "a@b.test", email_verified: false }))).toBeNull();
    expect(emailFromIdToken("nope")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });
});

describe("Google events", () => {
  const dayStart = (d: string) => new Date(`${d}T05:00:00.000Z`); // New York in winter

  it("timed events keep their instants; all-day events cover business days", () => {
    expect(
      eventRange({ id: "1", start: { dateTime: "2026-11-27T10:00:00-05:00" }, end: { dateTime: "2026-11-27T11:30:00-05:00" } }, dayStart)
    ).toEqual({ startUtc: "2026-11-27T15:00:00.000Z", endUtc: "2026-11-27T16:30:00.000Z", allDay: false });
    expect(eventRange({ id: "2", start: { date: "2026-11-27" }, end: { date: "2026-11-28" } }, dayStart)).toEqual({
      startUtc: "2026-11-27T05:00:00.000Z",
      endUtc: "2026-11-28T05:00:00.000Z",
      allDay: true,
    });
    expect(eventRange({ id: "3" }, dayStart)).toBeNull();
  });

  it("busy means not free, not declined, not canceled, not the CRM's own copy", () => {
    const base: GoogleEvent = { id: "e", status: "confirmed" };
    expect(isBusyEvent(base)).toBe(true);
    expect(isBusyEvent({ ...base, transparency: "transparent" })).toBe(false);
    expect(isBusyEvent({ ...base, status: "cancelled" })).toBe(false);
    expect(isBusyEvent({ ...base, attendees: [{ self: true, responseStatus: "declined" }] })).toBe(false);
    const own = { ...base, extendedProperties: { private: { crmBookingId: "bk_1" } } };
    expect(isCrmEvent(own)).toBe(true);
    expect(isBusyEvent(own)).toBe(false);
  });
});

describe("CRM origin for the Google round trip", () => {
  const req = (host: string, proto = "https") =>
    new Request("http://internal/api/calendar/google/connect", {
      headers: { "x-forwarded-host": host, "x-forwarded-proto": proto, cookie: "a=1; gcal_oauth=abc" },
    });

  it("keeps a trusted address and falls back to the base for anything else", () => {
    expect(crmOrigin(req("alt.example.test"))).toBe("https://alt.example.test");
    expect(crmOrigin(req("evil.test"))).toBe("https://crm.example.test");
    expect(googleRedirectUri("https://alt.example.test")).toBe("https://alt.example.test/api/calendar/google/callback");
  });

  it("reads the state cookie", () => {
    expect(readCookie(req("alt.example.test"), "gcal_oauth")).toBe("abc");
    expect(readCookie(req("alt.example.test"), "missing")).toBeNull();
  });
});
