import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { calendarColor } from "@/lib/calendar-colors";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getEnv } from "@/lib/env";

/**
 * Google accounts linked with "Connect Google" in Settings → Calendar.
 *
 * One OAuth client (the business's own Google Cloud app, in Vercel env) links
 * any number of Google emails. Each gets its own encrypted refresh token. The
 * CRM asks for one calendar permission (`calendar.events`): enough to write
 * the appointments, read the events (busy times and the Appointments page) and
 * delete what it wrote.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export type CalendarAccount = {
  id: string;
  email: string;
  calendarId: string;
  writeBookings: boolean;
  blockBusy: boolean;
  showEvents: boolean;
  /** The brand whose appointments it gets, or null. */
  brand: string | null;
  status: "connected" | "error";
  lastError: string | null;
  /** Its color on the CRM calendar (by the order it was linked). */
  color: string;
};

type AccountWithToken = CalendarAccount & { refreshToken: string };

export function googleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/* ------------------------------------------------------------------ store */

function toAccount(row: typeof schema.calendarAccount.$inferSelect, index: number): CalendarAccount {
  return {
    id: row.id,
    email: row.email,
    calendarId: row.calendarId,
    writeBookings: row.writeBookings,
    blockBusy: row.blockBusy,
    showEvents: row.showEvents,
    brand: row.brand,
    status: row.status,
    lastError: row.lastError,
    color: calendarColor(index),
  };
}

export async function listCalendarAccounts(organizationId: string): Promise<CalendarAccount[]> {
  const rows = await getDb()
    .select()
    .from(schema.calendarAccount)
    .where(scoped(schema.calendarAccount.organizationId, organizationId))
    .orderBy(asc(schema.calendarAccount.createdAt));
  return rows.map((row, i) => toAccount(row, i));
}

async function accountsWithTokens(organizationId: string): Promise<AccountWithToken[]> {
  const rows = await getDb()
    .select()
    .from(schema.calendarAccount)
    .where(scoped(schema.calendarAccount.organizationId, organizationId))
    .orderBy(asc(schema.calendarAccount.createdAt));
  const out: AccountWithToken[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      out.push({
        ...toAccount(row, i),
        refreshToken: decryptSecret({
          cipher: row.refreshTokenCipher,
          iv: row.refreshTokenIv,
          tag: row.refreshTokenTag,
        }),
      });
    } catch (err) {
      console.warn(`[calendar] couldn't decrypt the token of ${row.id}: ${err}`);
    }
  }
  return out;
}

/** Links (or relinks) an email. The first one linked receives the appointments. */
export async function saveCalendarAccount(input: {
  organizationId: string;
  email: string;
  refreshToken: string;
}): Promise<CalendarAccount> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const enc = encryptSecret(input.refreshToken);
  const existing = await listCalendarAccounts(input.organizationId);
  const tokenCols = {
    refreshTokenCipher: enc.cipher,
    refreshTokenIv: enc.iv,
    refreshTokenTag: enc.tag,
    status: "connected" as const,
    lastError: null,
  };
  const [row] = await db
    .insert(schema.calendarAccount)
    .values({
      id: newId("calendarAccount"),
      organizationId: input.organizationId,
      provider: "google",
      email,
      writeBookings: !existing.some((a) => a.writeBookings),
      ...tokenCols,
    })
    .onConflictDoUpdate({
      target: [
        schema.calendarAccount.organizationId,
        schema.calendarAccount.provider,
        schema.calendarAccount.email,
      ],
      set: { ...tokenCols, updatedAt: new Date() },
    })
    .returning();
  clearAccountCaches();
  return withColor(input.organizationId, row!);
}

export async function updateCalendarAccount(
  organizationId: string,
  id: string,
  patch: { writeBookings?: boolean; blockBusy?: boolean; showEvents?: boolean; brand?: string | null }
): Promise<CalendarAccount | null> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.blockBusy !== undefined) set.blockBusy = patch.blockBusy;
  if (patch.showEvents !== undefined) set.showEvents = patch.showEvents;
  if (patch.brand !== undefined) set.brand = patch.brand;
  if (patch.writeBookings !== undefined) set.writeBookings = patch.writeBookings;
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.calendarAccount)
      .set(set)
      .where(
        scoped(schema.calendarAccount.organizationId, organizationId, eq(schema.calendarAccount.id, id))
      )
      .returning();
    return rows[0] ?? null;
  });
  clearAccountCaches();
  return result ? withColor(organizationId, result) : null;
}

/** An account as the screens see it, with its color (its place in the link order). */
async function withColor(
  organizationId: string,
  row: typeof schema.calendarAccount.$inferSelect
): Promise<CalendarAccount> {
  const all = await listCalendarAccounts(organizationId);
  return all.find((a) => a.id === row.id) ?? toAccount(row, all.length);
}

export async function deleteCalendarAccount(organizationId: string, id: string): Promise<boolean> {
  const db = getDb();
  // Give the permission back to Google too, so the account no longer lists
  // the CRM. Best effort: the link is removed here either way.
  const linked = (await accountsWithTokens(organizationId)).find((a) => a.id === id);
  if (linked) await revokeGoogleToken(linked.refreshToken);
  const rows = await db
    .delete(schema.calendarAccount)
    .where(scoped(schema.calendarAccount.organizationId, organizationId, eq(schema.calendarAccount.id, id)))
    .returning({ id: schema.calendarAccount.id });
  // Appointments it held keep their copies in Google; the CRM just stops
  // updating them.
  await db
    .update(schema.booking)
    .set({ calendarAccountId: null, calendarEventId: null })
    .where(and(eq(schema.booking.organizationId, organizationId), eq(schema.booking.calendarAccountId, id)));
  clearAccountCaches();
  return rows.length > 0;
}

async function revokeGoogleToken(refreshToken: string): Promise<void> {
  await fetch(`${getEnv().GOOGLE_OAUTH_BASE_URL}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }).toString(),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

async function markAccountError(id: string, message: string): Promise<void> {
  await getDb()
    .update(schema.calendarAccount)
    .set({ status: "error", lastError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(schema.calendarAccount.id, id));
  clearAccountCaches();
}

async function markAccountOk(id: string): Promise<void> {
  await getDb()
    .update(schema.calendarAccount)
    .set({ status: "connected", lastError: null, updatedAt: new Date() })
    .where(and(eq(schema.calendarAccount.id, id), eq(schema.calendarAccount.status, "error")));
}

/* ------------------------------------------------------------------ OAuth */

function stateKey(): Buffer {
  return createHash("sha256").update(`calendar-oauth:${getEnv().BETTER_AUTH_SECRET}`).digest();
}

/** Signed state for the Google round trip: who started it, and a nonce tied to a cookie. */
export function signOAuthState(input: {
  organizationId: string;
  userId: string;
  origin: string;
  /** Times Google already came back without the calendar permission. */
  retries?: number;
}): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(
    JSON.stringify({
      o: input.organizationId,
      u: input.userId,
      r: input.origin,
      n: nonce,
      t: input.retries ?? 0,
      e: Date.now() + 10 * 60_000,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return { state: `${payload}.${sig}`, nonce };
}

export function verifyOAuthState(
  state: string | null,
  nonce: string | null
): { organizationId: string; userId: string; origin: string; retries: number } | null {
  if (!state || !nonce) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateKey()).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      o: string;
      u: string;
      r: string;
      n: string;
      t?: number;
      e: number;
    };
    if (data.e < Date.now() || data.n !== nonce) return null;
    return { organizationId: data.o, userId: data.u, origin: data.r, retries: data.t ?? 0 };
  } catch {
    return null;
  }
}

export function googleAuthUrl(input: {
  redirectUri: string;
  state: string;
  loginHint?: string;
  /** Asking again for the same account: straight to the permission screen. */
  skipAccountPicker?: boolean;
}): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token (also on relink).
    prompt: input.skipAccountPicker ? "consent" : "consent select_account",
    include_granted_scopes: "true",
    state: input.state,
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${env.GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Either one lets the CRM read and write events. */
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

/** The person left the calendar box unticked on Google's permission screen. */
export class CalendarScopeMissingError extends Error {
  constructor(readonly email: string | null = null) {
    super("Calendar access wasn't granted. Connect again and tick the calendar permission.");
    this.name = "CalendarScopeMissingError";
  }
}

/** Trades the code for tokens and reads which email signed in. */
export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ email: string; refreshToken: string | null }> {
  const env = getEnv();
  const res = await fetch(`${env.GOOGLE_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = (await res.json().catch(() => null)) as {
    refresh_token?: string;
    id_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !data) {
    throw new Error(data?.error_description || data?.error || `Google answered ${res.status}`);
  }
  const granted = (data.scope ?? "").split(/\s+/);
  if (!CALENDAR_SCOPES.some((s) => granted.includes(s))) {
    throw new CalendarScopeMissingError(emailFromIdToken(data.id_token));
  }
  const email = emailFromIdToken(data.id_token);
  if (!email) throw new Error("Google didn't say which email signed in");
  return { email, refreshToken: data.refresh_token ?? null };
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so its
 * payload is read without checking the signature (Google's own guidance for
 * tokens received this way).
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      email?: string;
      email_verified?: boolean;
    };
    return payload.email && payload.email_verified !== false ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- Google API */

type CachedToken = { token: string; expiresAtMs: number };
type EventsCache = { at: number; events: GoogleEvent[] };
const store = globalThis as unknown as {
  __gcalTokens?: Map<string, CachedToken>;
  __gcalEvents?: Map<string, EventsCache>;
};
function tokens(): Map<string, CachedToken> {
  return (store.__gcalTokens ??= new Map());
}
function eventsCache(): Map<string, EventsCache> {
  return (store.__gcalEvents ??= new Map());
}
function clearAccountCaches(): void {
  eventsCache().clear();
}

class GoogleAuthError extends Error {}

async function accessToken(acc: AccountWithToken): Promise<string> {
  const key = `${acc.id}:${createHash("sha256").update(acc.refreshToken).digest("hex").slice(0, 16)}`;
  const hit = tokens().get(key);
  if (hit && hit.expiresAtMs > Date.now()) return hit.token;
  const env = getEnv();
  const res = await fetch(`${env.GOOGLE_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(5000),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  } | null;
  if (!res.ok || !data?.access_token) {
    if (res.status === 400 || res.status === 401) {
      const msg =
        data?.error === "invalid_grant"
          ? "Google revoked access. Connect this email again."
          : `Google refused the sign-in (${data?.error ?? res.status}).`;
      await markAccountError(acc.id, msg).catch(() => {});
      throw new GoogleAuthError(msg);
    }
    throw new Error(`Couldn't get a Google token (${res.status})`);
  }
  // A minute of margin so a token never expires mid-request.
  tokens().set(key, { token: data.access_token, expiresAtMs: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 });
  return data.access_token;
}

async function gcal(
  acc: AccountWithToken,
  path: string,
  init: RequestInit & { allow404?: boolean; timeoutMs?: number } = {}
): Promise<unknown> {
  const token = await accessToken(acc);
  const res = await fetch(`${getEnv().GOOGLE_CAL_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(init.timeoutMs ?? 8000),
  });
  if ((res.status === 404 || res.status === 410) && init.allow404) return null;
  if (res.status === 204) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      await markAccountError(acc.id, `Google refused calendar access (${res.status}). Connect this email again.`).catch(
        () => {}
      );
    }
    throw new Error(`Google Calendar answered ${res.status}: ${detail.slice(0, 300)}`);
  }
  await markAccountOk(acc.id).catch(() => {});
  return await res.json().catch(() => null);
}

const calPath = (acc: CalendarAccount) => `/calendars/${encodeURIComponent(acc.calendarId)}/events`;

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

async function listEvents(acc: AccountWithToken, fromUtc: Date, toUtc: Date): Promise<GoogleEvent[]> {
  const key = `${acc.id}|${fromUtc.toISOString()}|${toUtc.toISOString()}`;
  const hit = eventsCache().get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.events;
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      timeMin: fromUtc.toISOString(),
      timeMax: toUtc.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const data = (await gcal(acc, `${calPath(acc)}?${q.toString()}`, { timeoutMs: 4000 })) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
    } | null;
    events.push(...(data?.items ?? []));
    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }
  eventsCache().set(key, { at: Date.now(), events });
  return events;
}

/** Instant range of a Google event; all-day events cover their days in the business's zone. */
export function eventRange(
  ev: GoogleEvent,
  dayStartUtc: (dayIso: string) => Date | null
): { startUtc: string; endUtc: string; allDay: boolean } | null {
  if (ev.start?.dateTime && ev.end?.dateTime) {
    const s = Date.parse(ev.start.dateTime);
    const e = Date.parse(ev.end.dateTime);
    if (Number.isNaN(s) || Number.isNaN(e)) return null;
    return { startUtc: new Date(s).toISOString(), endUtc: new Date(e).toISOString(), allDay: false };
  }
  if (ev.start?.date && ev.end?.date) {
    const s = dayStartUtc(ev.start.date);
    const e = dayStartUtc(ev.end.date);
    if (!s || !e) return null;
    return { startUtc: s.toISOString(), endUtc: e.toISOString(), allDay: true };
  }
  return null;
}

/** Events the CRM wrote itself carry the booking id; they're already CRM appointments. */
export function isCrmEvent(ev: GoogleEvent): boolean {
  return Boolean(ev.extendedProperties?.private?.crmBookingId);
}

/** Busy = not canceled, not "free", not declined by the calendar's owner, not the CRM's own. */
export function isBusyEvent(ev: GoogleEvent): boolean {
  if (ev.status === "cancelled" || ev.transparency === "transparent" || isCrmEvent(ev)) return false;
  const me = ev.attendees?.find((a) => a.self);
  return me?.responseStatus !== "declined";
}

export type ExternalEvent = {
  id: string;
  accountId: string;
  email: string;
  color: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  htmlLink: string | null;
};

/**
 * Events of the linked calendars in a range. Each account fails on its own: a
 * Google hiccup never breaks the CRM, it just leaves that calendar out.
 */
export async function externalEvents(
  organizationId: string,
  input: {
    fromUtc: Date;
    toUtc: Date;
    dayStartUtc: (dayIso: string) => Date | null;
    purpose: "busy" | "show";
  }
): Promise<ExternalEvent[]> {
  if (!googleOAuthConfigured()) return [];
  const accounts = (await accountsWithTokens(organizationId)).filter(
    (a) => a.status === "connected" && (input.purpose === "busy" ? a.blockBusy : a.showEvents)
  );
  const lists = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const evs = await listEvents(acc, input.fromUtc, input.toUtc);
        return evs
          .filter((ev) => ev.status !== "cancelled" && !isCrmEvent(ev))
          .filter((ev) => (input.purpose === "busy" ? isBusyEvent(ev) : true))
          .map((ev) => {
            const r = eventRange(ev, input.dayStartUtc);
            return r
              ? {
                  id: `gcal_${acc.id}_${ev.id}`,
                  accountId: acc.id,
                  email: acc.email,
                  color: acc.color,
                  title: ev.summary?.trim() || "Busy",
                  htmlLink: ev.htmlLink ?? null,
                  ...r,
                }
              : null;
          })
          .filter((x): x is ExternalEvent => x !== null);
      } catch (err) {
        if (!(err instanceof GoogleAuthError)) console.warn(`[calendar] couldn't read ${acc.email}: ${err}`);
        return [];
      }
    })
  );
  return lists.flat();
}

/* ------------------------------------------------- CRM appointment → Google */

export type BookingEventInput = {
  bookingId: string;
  title: string;
  startUtc: string;
  durationMinutes: number;
  timezone: string;
  location: string | null;
  description: string;
};

function eventBody(input: BookingEventInput) {
  const end = new Date(Date.parse(input.startUtc) + input.durationMinutes * 60_000).toISOString();
  return {
    summary: input.title,
    location: input.location ?? undefined,
    description: input.description,
    start: { dateTime: input.startUtc, timeZone: input.timezone },
    end: { dateTime: end, timeZone: input.timezone },
    extendedProperties: { private: { crmBookingId: input.bookingId } },
  };
}

/**
 * The Google event id of a CRM appointment: the same in every linked calendar,
 * derived from the booking id (Google allows a-v and 0-9), so the CRM never has
 * to remember which calendars hold a copy.
 */
export function crmEventId(bookingId: string): string {
  return `crm${Buffer.from(bookingId, "utf8").toString("hex")}`;
}

/** Linked calendars that can be written to right now. */
export async function connectedAccounts(organizationId: string): Promise<AccountWithToken[]> {
  if (!googleOAuthConfigured()) return [];
  return (await accountsWithTokens(organizationId)).filter((a) => a.status === "connected");
}

/** Creates or updates the copy of an appointment (also restores one deleted in Google). */
export async function upsertBookingEvent(acc: AccountWithToken, input: BookingEventInput): Promise<void> {
  const id = crmEventId(input.bookingId);
  const body = JSON.stringify({ ...eventBody(input), status: "confirmed" });
  const path = `${calPath(acc)}/${encodeURIComponent(id)}`;
  const patched = await gcal(acc, path, { method: "PATCH", body, allow404: true });
  if (patched === null) {
    try {
      await gcal(acc, calPath(acc), { method: "POST", body: JSON.stringify({ id, ...JSON.parse(body) }) });
    } catch (err) {
      // Created meanwhile by another request: update it instead.
      if (!String(err).includes(" 409")) throw err;
      await gcal(acc, path, { method: "PATCH", body });
    }
  }
  clearAccountCaches();
}

/** Removes the copy of an appointment from one calendar; nothing there is fine. */
export async function removeBookingEvent(acc: AccountWithToken, bookingId: string): Promise<void> {
  await deleteBookingEvent(acc, crmEventId(bookingId));
}

export async function accountById(organizationId: string, id: string): Promise<AccountWithToken | null> {
  const accounts = await accountsWithTokens(organizationId);
  return accounts.find((a) => a.id === id) ?? null;
}

export async function deleteBookingEvent(acc: AccountWithToken, eventId: string): Promise<void> {
  await gcal(acc, `${calPath(acc)}/${encodeURIComponent(eventId)}`, { method: "DELETE", allow404: true });
  clearAccountCaches();
}
