import { and, asc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { dayIsoInTz } from "@/lib/time/slots";
import { getSettings } from "@/server/agenda/settings";
import {
  connectedAccounts,
  deleteBookingEvent,
  removeBookingEvent,
  upsertBookingEvent,
  type BookingEventInput,
} from "@/server/calendar-accounts/google";

/**
 * Keeps the Google copies of a CRM appointment in step with the CRM: created
 * when booked, moved when rescheduled, deleted when canceled, in every linked
 * calendar set to receive appointments. The CRM is the truth; Google is a
 * mirror. Nothing here can undo or block a booking: a failure is logged and
 * the next change tries again.
 */
export async function syncBookingCalendar(organizationId: string, bookingId: string): Promise<void> {
  try {
    await sync(organizationId, bookingId);
  } catch (err) {
    console.warn(`[calendar] couldn't mirror booking ${bookingId} to Google: ${err}`);
  }
}

/**
 * Re-mirrors the upcoming appointments after a calendar starts or stops
 * receiving them, so it gets (or loses) the ones already booked.
 */
export async function resyncUpcomingBookings(organizationId: string): Promise<void> {
  const rows = await getDb()
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(eq(schema.booking.kind, "session"), gte(schema.booking.scheduledAt, new Date()))
      )
    )
    .orderBy(asc(schema.booking.scheduledAt))
    .limit(200);
  for (const r of rows) await syncBookingCalendar(organizationId, r.id);
}

async function sync(organizationId: string, bookingId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      booking: schema.booking,
      contactName: schema.contact.name,
      contactPhone: schema.contact.phone,
    })
    .from(schema.booking)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.booking.contactId))
    .where(scoped(schema.booking.organizationId, organizationId, eq(schema.booking.id, bookingId)))
    .limit(1);
  if (!row) return;
  const b = row.booking;
  const accounts = await connectedAccounts(organizationId);

  // Copies made before each calendar got its fixed event id: remove the old one.
  if (b.calendarEventId) {
    const legacy = accounts.find((a) => a.id === b.calendarAccountId);
    if (legacy) await deleteBookingEvent(legacy, b.calendarEventId).catch(() => {});
    await db
      .update(schema.booking)
      .set({ calendarAccountId: null, calendarEventId: null })
      .where(eq(schema.booking.id, b.id));
  }

  // Canceled (or a test, a block, or already a Google Meet event): no copies.
  const mirrored = b.kind === "session" && !b.isTest && b.status !== "cancelada" && b.connector !== "google";
  const input = mirrored ? await eventInput(organizationId, b, row.contactName, row.contactPhone) : null;

  const results = await Promise.allSettled(
    accounts.map((acc) =>
      input && acc.writeBookings ? upsertBookingEvent(acc, input) : removeBookingEvent(acc, b.id)
    )
  );
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length) throw new Error(failed.map((f) => String(f.reason)).join("; "));
}

async function eventInput(
  organizationId: string,
  b: typeof schema.booking.$inferSelect,
  contactName: string | null,
  contactPhone: string | null
): Promise<BookingEventInput> {
  const settings = await getSettings(organizationId);
  const who = contactName?.trim() || "Customer";
  const what =
    b.connector === "in-home" ? "Inspection" : b.connector === "enlace-fijo" && !b.meetingLink ? "Call" : "Appointment";
  const day = dayIsoInTz(b.scheduledAt, settings.timezone);
  const lines = [
    contactPhone ? `Phone: ${contactPhone}` : null,
    b.propertyAddress ? `Address: ${b.propertyAddress}` : null,
    b.meetingLink && b.connector !== "in-home" ? `Join: ${b.meetingLink}` : null,
    b.notes ? `Notes: ${b.notes}` : null,
    b.status === "realizada" ? "Status: completed" : b.status === "no_show" ? "Status: no-show" : null,
    "",
    `Open in the CRM: ${getEnv().APP_BASE_URL.replace(/\/$/, "")}/bookings?vista=dia&fecha=${day}`,
  ].filter((x): x is string => x !== null);
  return {
    bookingId: b.id,
    title: `${what}: ${who}`,
    startUtc: b.scheduledAt.toISOString(),
    durationMinutes: b.durationMinutes,
    timezone: settings.timezone,
    location: b.propertyAddress,
    description: lines.join("\n"),
  };
}
