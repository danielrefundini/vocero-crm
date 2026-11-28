import type { CSSProperties } from "react";
import type { BookingListItem } from "@/server/agenda/queries";

/** 215 — Cómo se ve y cómo se nombra una cita, igual en las cuatro vistas. */

export type Booking = BookingListItem;

export const STATUS_LABEL: Record<Booking["status"], string> = {
  agendada: "Booked",
  realizada: "Completed",
  no_show: "No-show",
  cancelada: "Canceled",
};

/** Un bloqueo no se "agenda" ni se "cancela": está activo o se quitó. */
export function statusLabel(b: Booking): string {
  if (b.external) return "Google";
  if (b.kind === "block") return b.status === "cancelada" ? "Removed" : "Active";
  return STATUS_LABEL[b.status];
}

/** Lo que se lee en la rejilla: el contacto o, en un bloqueo, su nota. */
export function bookingTitle(b: Booking): string {
  if (b.external) return b.notes?.trim() || "Busy";
  if (b.kind === "block") return b.notes?.trim() || "Block";
  return b.contact?.name.trim() || "No contact";
}

/**
 * Color por estado, solo con tokens (regla 1 de `tailwind.config.ts`). Lo que
 * viene es relleno del acento, como un evento de Google; lo que ya pasó se
 * apaga a su tinta de estado para que la semana se lea de un vistazo.
 */
export function bookingTone(b: Booking): { box: string; dot: string } {
  if (b.status === "cancelada") {
    return {
      box: "border-dashed border-border-strong bg-subtle text-text-3 line-through",
      dot: "bg-text-4",
    };
  }
  if (b.external) {
    return { box: "border-border-strong bg-subtle text-text-2", dot: "bg-text-4" };
  }
  if (b.kind === "block") {
    return { box: "booking-hatch border-border-strong text-text-2", dot: "bg-text-3" };
  }
  if (b.status === "realizada") {
    return { box: "border-success-soft bg-success-tint text-success-text", dot: "bg-success" };
  }
  if (b.status === "no_show") {
    return { box: "border-warning-soft bg-warning-tint text-warning-text", dot: "bg-warning" };
  }
  return { box: "border-transparent bg-brand text-brand-fg", dot: "bg-brand" };
}

/**
 * El proveedor falló al crear la reunión: la cita existe y lo único que falta
 * es el enlace, que se reintenta desde el panel. En esta edición la entrega
 * es eso —el enlace del conector—; no hay más estados que vigilar.
 */
export function canRetrySync(b: Booking): boolean {
  return b.linkPending && b.status !== "cancelada";
}

/** Aviso pequeño en la rejilla: la cita quedó sin enlace de la reunión. */
export function hasDeliveryIssue(b: Booking): boolean {
  return canRetrySync(b);
}

/** A linked Google calendar as the range response lists it. */
export type LinkedCalendar = {
  id: string;
  email: string;
  color: string;
  writeBookings: boolean;
  showEvents: boolean;
};

/** Whether the CRM copies this appointment to the calendars that receive them. */
export function isMirrored(b: Booking): boolean {
  return b.kind === "session" && !b.isTest && b.status !== "cancelada" && b.connector !== "google";
}

/**
 * Tags every booking with the Google calendars it's in: a Google event, its
 * own; a CRM appointment, each linked calendar set to receive appointments.
 */
export function withCalendars(bookings: Booking[], calendars: LinkedCalendar[]): Booking[] {
  const writers = calendars.filter((c) => c.writeBookings).map(({ email, color }) => ({ email, color }));
  const byEmail = new Map(calendars.map((c) => [c.email, c.color]));
  return bookings.map((b) => {
    if (b.external) {
      const color = b.external.color ?? byEmail.get(b.external.email);
      return color ? { ...b, calendars: [{ email: b.external.email, color }] } : b;
    }
    return isMirrored(b) && writers.length ? { ...b, calendars: writers } : b;
  });
}

/** A Google event takes its calendar's color: a tinted box with a solid edge. */
export function bookingBoxStyle(b: Booking): CSSProperties | undefined {
  const color = b.external ? b.calendars?.[0]?.color : undefined;
  if (!color || b.status === "cancelada") return undefined;
  return { backgroundColor: `${color}1f`, borderColor: `${color}66`, borderLeft: `3px solid ${color}` };
}

/** The dot of a Google event in its calendar's color (others keep their class). */
export function bookingDotStyle(b: Booking): CSSProperties | undefined {
  const color = b.external ? b.calendars?.[0]?.color : undefined;
  return color ? { backgroundColor: color } : undefined;
}

/**
 * Keeps what belongs to the Google calendar picked on the calendar screen: its
 * events, and the CRM appointments copied to it. CRM appointments copied only
 * to the calendars not picked are hidden too; ones in no Google calendar
 * always show.
 */
export function hideCalendars(bookings: Booking[], hidden: ReadonlySet<string>): Booking[] {
  if (hidden.size === 0) return bookings;
  return bookings.filter((b) => {
    if (b.external) return !hidden.has(b.external.email);
    const cals = b.calendars ?? [];
    return cals.length === 0 || cals.some((c) => !hidden.has(c.email));
  });
}

/** How many Google events each linked calendar has in the bookings given. */
export function eventCounts(bookings: Booking[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookings) if (b.external) out.set(b.external.email, (out.get(b.external.email) ?? 0) + 1);
  return out;
}
