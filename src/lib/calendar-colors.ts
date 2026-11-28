/**
 * One color per linked Google calendar, in the order they were linked, so the
 * calendar shows at a glance which email an appointment or event belongs to.
 * Shared by the server (which assigns them) and the screens (which paint them).
 */
export const CALENDAR_COLORS = [
  "#2563eb", // blue
  "#db2777", // pink
  "#16a34a", // green
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // teal
] as const;

export function calendarColor(index: number): string {
  const i = ((index % CALENDAR_COLORS.length) + CALENDAR_COLORS.length) % CALENDAR_COLORS.length;
  return CALENDAR_COLORS[i]!;
}
