import { withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { googleAuthUrl, googleOAuthConfigured, signOAuthState } from "@/server/calendar-accounts/google";
import { crmOrigin, googleRedirectUri, redirectTo, stateCookie } from "@/server/calendar-accounts/origin";

export const dynamic = "force-dynamic";

/** "Connect Google": sends the owner to Google's sign-in, then back to the callback. */
export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const origin = crmOrigin(req);
  const back = (q: string) => redirectTo(`${origin}/settings/calendar?google=${q}`);
  if (session.role !== "owner") return back("owner_only");
  if (!googleOAuthConfigured()) return back("not_configured");
  const { state, nonce } = signOAuthState({
    organizationId: session.organizationId,
    userId: session.userId,
    origin,
  });
  const hint = new URL(req.url).searchParams.get("email") ?? undefined;
  return redirectTo(
    googleAuthUrl({ redirectUri: googleRedirectUri(origin), state, loginHint: hint }),
    stateCookie(nonce, origin, 600)
  );
});
