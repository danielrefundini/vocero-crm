import { withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { googleOAuthConfigured, listCalendarAccounts } from "@/server/calendar-accounts/google";
import { crmOrigin, googleRedirectUri } from "@/server/calendar-accounts/origin";

export const dynamic = "force-dynamic";

/** Linked Google calendars, and whether "Connect Google" is set up on this instance. */
export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  return Response.json({
    configured: googleOAuthConfigured(),
    redirectUri: googleRedirectUri(crmOrigin(req)),
    canManage: session.role === "owner",
    accounts: await listCalendarAccounts(session.organizationId),
  });
});
