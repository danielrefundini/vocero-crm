import { describe, expect, it } from "vitest";
import { calendarColor, CALENDAR_COLORS } from "@/lib/calendar-colors";
import { bookingTargets, NO_GOOGLE_COPY } from "@/server/calendar-accounts/sync";
import { eventCounts, hideCalendars, withCalendars, type Booking, type LinkedCalendar } from "@/components/bookings/booking-look";

const base: Booking = {
  id: "bk_1",
  kind: "session",
  status: "agendada",
  source: "manual",
  scheduledAtUtc: "2026-12-01T18:00:00.000Z",
  durationMinutes: 60,
  date: "2026-12-01",
  time: "13:00",
  weekday: 2,
  contact: null,
  conversationId: null,
  connector: "in-home",
  meetingLink: null,
  propertyAddress: null,
  linkPending: false,
  isTest: false,
  notes: null,
} as unknown as Booking;

const cals: LinkedCalendar[] = [
  { id: "a", email: "biz@x.test", color: calendarColor(0), writeBookings: true, showEvents: true },
  { id: "b", email: "me@x.test", color: calendarColor(1), writeBookings: false, showEvents: true },
];

describe("Linked calendar colors", () => {
  it("gives each linked calendar its own color, in link order", () => {
    expect(calendarColor(0)).toBe(CALENDAR_COLORS[0]);
    expect(calendarColor(1)).not.toBe(calendarColor(0));
    expect(calendarColor(CALENDAR_COLORS.length)).toBe(CALENDAR_COLORS[0]);
  });

  it("tags appointments with the calendars they're copied to, and Google events with their own", () => {
    const ext = { ...base, id: "gcal_b_1", kind: "block", external: { email: "me@x.test", htmlLink: null, allDay: false } } as Booking;
    const [appt, cancelled, event] = withCalendars([base, { ...base, id: "bk_2", status: "cancelada" }, ext], cals);
    expect(appt!.calendars).toEqual([{ email: "biz@x.test", color: calendarColor(0) }]);
    expect(cancelled!.calendars).toBeUndefined();
    expect(event!.calendars).toEqual([{ email: "me@x.test", color: calendarColor(1) }]);
  });

  it("shows only what's in the picked calendar: its events and the appointments copied to it", () => {
    const ext = { ...base, id: "gcal_b_1", kind: "block", external: { email: "me@x.test", htmlLink: null, allDay: false } } as Booking;
    const plain = { ...base, id: "bk_test", isTest: true } as Booking;
    const tagged = withCalendars([base, ext, plain], cals);
    // Only biz@ picked: its appointment stays, me@'s event goes.
    expect(hideCalendars(tagged, new Set(["me@x.test"])).map((b) => b.id)).toEqual(["bk_1", "bk_test"]);
    // Only me@ picked: bk_1 (copied only to biz@) goes too; bk_test is in no calendar, so it stays.
    expect(hideCalendars(tagged, new Set(["biz@x.test"])).map((b) => b.id)).toEqual(["gcal_b_1", "bk_test"]);
    expect(eventCounts(tagged)).toEqual(new Map([["me@x.test", 1]]));
  });

  it("copies an appointment only to the calendar picked in its panel, or to none", () => {
    const [toMe, none, gone] = withCalendars(
      [
        { ...base, calendarAccountId: "b" },
        { ...base, id: "bk_2", calendarAccountId: "none" },
        { ...base, id: "bk_3", calendarAccountId: "unlinked" },
      ] as Booking[],
      cals
    );
    // Picked me@ even though it doesn't receive appointments by default.
    expect(toMe!.calendars).toEqual([{ email: "me@x.test", color: calendarColor(1) }]);
    expect(none!.calendars).toBeUndefined();
    // A pick whose account was removed falls back to the default.
    expect(gone!.calendars).toEqual([{ email: "biz@x.test", color: calendarColor(0) }]);
  });
});

describe("bookingTargets (server)", () => {
  const accs = [
    { id: "a", writeBookings: true, status: "connected" },
    { id: "b", writeBookings: false, status: "connected" },
    { id: "c", writeBookings: true, status: "error" },
  ];
  it("follows the pick, none, or the default receiving calendars", () => {
    expect(bookingTargets(accs, null).map((a) => a.id)).toEqual(["a"]);
    expect(bookingTargets(accs, "b").map((a) => a.id)).toEqual(["b"]);
    expect(bookingTargets(accs, NO_GOOGLE_COPY)).toEqual([]);
    expect(bookingTargets(accs, "c").map((a) => a.id)).toEqual(["a"]);
    expect(bookingTargets(accs, "zzz").map((a) => a.id)).toEqual(["a"]);
  });
});
