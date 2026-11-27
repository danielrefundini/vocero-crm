import { withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  exchangeGoogleCode,
  listCalendarAccounts,
  saveCalendarAccount,
  verifyOAuthState,
} from "@/server/calendar-accounts/google";
import {
  STATE_COOKIE,
  crmOrigin,
  googleRedirectUri,
  readCookie,
  redirectTo,
  stateCookie,
} from "@/server/calendar-accounts/origin";

export const dynamic = "force-dynamic";

/** Google sends the owner back here with a code; the email is linked and they return to Settings. */
export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const url = new URL(req.url);
  const origin = crmOrigin(req);
  const back = (q: string, extra = "") =>
    redirectTo(`${origin}/settings/calendar?google=${q}${extra}`, stateCookie("", origin, 0));

  if (url.searchParams.get("error")) return back("canceled");
  const state = verifyOAuthState(url.searchParams.get("state"), readCookie(req, STATE_COOKIE));
  if (!state || state.organizationId !== session.organizationId || state.userId !== session.userId) {
    return back("expired");
  }
  if (session.role !== "owner") return back("owner_only");
  const code = url.searchParams.get("code");
  if (!code) return back("canceled");

  try {
    const { email, refreshToken } = await exchangeGoogleCode({
      code,
      redirectUri: googleRedirectUri(state.origin),
    });
    if (!refreshToken) {
      // Google leaves it out only when access was already granted; the connect
      // link always asks for consent, so this is rare. Keep the existing link.
      const known = (await listCalendarAccounts(session.organizationId)).some((a) => a.email === email);
      return back(known ? "connected" : "no_refresh_token");
    }
    await saveCalendarAccount({ organizationId: session.organizationId, email, refreshToken });
    return back("connected", `&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.warn(`[calendar] Google connect failed: ${err}`);
    return back("failed");
  }
});
