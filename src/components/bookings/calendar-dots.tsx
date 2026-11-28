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
 * The legend under the toolbar: which color is which linked Google calendar,
 * and a picker for whose Google events to see. "All" shows every calendar;
 * clicking an email shows only what's in that one: its events and the CRM
 * appointments copied to it (clicking it again, all). Nothing changes in
 * Google or the CRM.
 */
export function CalendarLegend({
  calendars,
  selected,
  counts,
  onSelect,
}: {
  calendars: { email: string; color: string }[];
  /** The calendar shown alone, or null for all of them. */
  selected: string | null;
  /** Google events per calendar in the range on screen. */
  counts: ReadonlyMap<string, number>;
  onSelect: (email: string | null) => void;
}) {
  if (calendars.length === 0) return null;
  const chip =
    "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2 text-xs text-text-2 sm:px-6">
      <span className="text-text-3">Google calendars:</span>
      {calendars.length > 1 && (
        <button
          type="button"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
          className={cn(
            chip,
            selected === null ? "border-foreground bg-foreground text-background hover:bg-foreground" : "border-border text-text-2"
          )}
        >
          All
        </button>
      )}
      {calendars.map((c) => {
        const on = selected === null || selected === c.email;
        const picked = selected === c.email;
        return (
          <button
            key={c.email}
            type="button"
            aria-pressed={picked}
            onClick={() => onSelect(picked ? null : c.email)}
            title={picked ? "Show all calendars" : `Show only ${c.email}`}
            className={cn(
              chip,
              picked ? "border-foreground font-semibold text-foreground" : on ? "border-border-strong text-foreground" : "border-dashed border-border text-text-3"
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
