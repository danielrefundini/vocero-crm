import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { dayIsoInTz } from "@/lib/time/slots";
import { getSettings } from "@/server/agenda/settings";
import {
  accountById,
  deleteBookingEvent,
  insertBookingEvent,
  patchBookingEvent,
  writeAccountFor,
  type BookingEventInput,
} from "@/server/calendar-accounts/google";

/**
 * Keeps the Google copy of a CRM appointment in step with the CRM: created
 * when booked, moved when rescheduled, deleted when canceled. The CRM is the
 * truth; Google is a mirror. Nothing here can undo or block a booking: a
 * failure is logged and the next change tries again.
 */
export async function syncBookingCalendar(organizationId: string, bookingId: string): Promise<void> {
  try {
    await sync(organizationId, bookingId);
  } catch (err) {
    console.warn(`[calendar] couldn't mirror booking ${bookingId} to Google: ${err}`);
  }
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

  const setLink = (accountId: string | null, eventId: string | null) =>
    db
      .update(schema.booking)
      .set({ calendarAccountId: accountId, calendarEventId: eventId })
      .where(eq(schema.booking.id, b.id));

  const previous =
    b.calendarAccountId && b.calendarEventId ? await accountById(organizationId, b.calendarAccountId) : null;

  // Canceled (or a test, or a block): no copy in Google.
  const mirrored = b.kind === "session" && !b.isTest && b.status !== "cancelada" && b.connector !== "google";
  if (!mirrored) {
    if (previous && b.calendarEventId) {
      await deleteBookingEvent(previous, b.calendarEventId);
      await setLink(null, null);
    }
    return;
  }

  const target = await writeAccountFor(organizationId);
  if (!target) return;
  const input = await eventInput(organizationId, b, row.contactName, row.contactPhone);

  if (previous && b.calendarEventId && previous.id === target.id) {
    if (await patchBookingEvent(target, b.calendarEventId, input)) return;
    // Deleted by hand in Google: put it back.
  } else if (previous && b.calendarEventId) {
    // The appointments calendar changed: move the copy over.
    await deleteBookingEvent(previous, b.calendarEventId).catch(() => {});
  }
  const eventId = await insertBookingEvent(target, input);
  await setLink(target.id, eventId);
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
