import { after } from "next/server";
import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { deleteCalendarAccount, updateCalendarAccount } from "@/server/calendar-accounts/google";
import { resyncUpcomingBookings } from "@/server/calendar-accounts/sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    writeBookings: z.boolean().optional(),
    blockBusy: z.boolean().optional(),
    showEvents: z.boolean().optional(),
  })
  .strict();

/** Owner only: what a linked calendar does. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can change linked calendars");
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid", "Send writeBookings, blockBusy or showEvents");
  const { id } = await ctx.params;
  const account = await updateCalendarAccount(session.organizationId, id, parsed.data);
  if (!account) return apiError(404, "not_found", "Linked calendar not found");
  // A calendar that starts (or stops) receiving appointments gets (or loses)
  // the ones already booked, after the answer is sent.
  if (parsed.data.writeBookings !== undefined) {
    const orgId = session.organizationId;
    after(() => resyncUpcomingBookings(orgId));
  }
  return Response.json({ account });
});

/** Owner only: unlink an email. Copies of appointments already in Google stay there. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can unlink calendars");
  }
  const { id } = await ctx.params;
  const ok = await deleteCalendarAccount(session.organizationId, id);
  if (!ok) return apiError(404, "not_found", "Linked calendar not found");
  return Response.json({ ok: true });
});
