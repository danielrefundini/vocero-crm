import { cn } from "@/lib/utils";
import type { Booking } from "./booking-look";

/**
 * Small dots in the colors of the Google calendars a CRM appointment is copied
 * to, so it's clear at a glance which email it went to. Google events are
 * painted in their calendar's color instead, so they get no dots.
 */
export function CalendarDots({ booking, className }: { booking: Booking; className?: string }) {
  const cals = booking.external ? [] : (booking.calendars ?? []);
  if (cals.length === 0) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
      title={`In Google: ${cals.map((c) => c.email).join(", ")}`}
      aria-label={`Copied to Google: ${cals.map((c) => c.email).join(", ")}`}
    >
      {cals.map((c) => (
        <span
          key={c.email}
          aria-hidden
          className="h-2 w-2 rounded-full ring-1 ring-white/80"
          style={{ backgroundColor: c.color }}
        />
      ))}
    </span>
  );
}

/**
 * The legend under the toolbar: which color is which linked Google calendar.
 * Each one is a toggle that shows or hides that calendar's events on this
 * screen, with how many there are in view (nothing changes in Google or the
 * CRM; CRM appointments always show).
 */
export function CalendarLegend({
  calendars,
  hidden,
  counts,
  onToggle,
}: {
  calendars: { email: string; color: string }[];
  hidden: ReadonlySet<string>;
  /** Google events per calendar in the range on screen. */
  counts: ReadonlyMap<string, number>;
  onToggle: (email: string) => void;
}) {
  if (calendars.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2 text-xs text-text-2 sm:px-6">
      <span className="text-text-3">Google calendars:</span>
      {calendars.map((c) => {
        const on = !hidden.has(c.email);
        return (
          <button
            key={c.email}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.email)}
            title={on ? `Hide ${c.email}'s events on the calendar` : `Show ${c.email}'s events on the calendar`}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
              on ? "border-border-strong text-foreground" : "border-dashed border-border text-text-3 line-through"
            )}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full border-2"
              style={{ borderColor: c.color, backgroundColor: on ? c.color : "transparent" }}
            />
            <span className="truncate">{c.email}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-text-3">{counts.get(c.email) ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
