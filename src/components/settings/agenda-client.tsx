"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CONNECTOR_META,
  CONNECTOR_ORDER,
  type ConnectorId,
} from "@/lib/agenda-connectors";
import { ConnectorCredentials } from "@/components/settings/connector-credentials";

/**
 * 015 — Ajustes → Agenda: cuándo atiende el negocio y cómo se entrega la
 * reunión.
 */

type Interval = { start: string; end: string };
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WeeklyHours = Partial<Record<DayKey, Interval[]>>;

type Settings = {
  weeklyHours: WeeklyHours;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  timezone: string;
  connector: ConnectorId;
  meetingLink: string | null;
};

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_INTERVAL: Interval = { start: "09:00", end: "18:00" };

export function AgendaClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<{ label: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const [cfg, avail] = await Promise.all([
        fetch("/api/calendar/settings").catch(() => null),
        fetch("/api/calendar/availability").catch(() => null),
      ]);
      if (cfg?.ok) {
        const data = (await cfg.json()) as { settings: Settings };
        setSettings(data.settings);
      }
      if (avail?.ok) {
        const data = (await avail.json()) as { slots: { label: string }[] };
        setSlots(data.slots.slice(0, 5));
      } else {
        setSlots([]);
      }
    })();
  }, []);

  async function refreshPreview() {
    const res = await fetch("/api/calendar/availability").catch(() => null);
    if (!res?.ok) return setSlots([]);
    const data = (await res.json()) as { slots: { label: string }[] };
    setSlots(data.slots.slice(0, 5));
  }

  function patch(next: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...next } : s));
    setSaved(false);
  }

  function toggleDay(day: DayKey) {
    if (!settings) return;
    const current = settings.weeklyHours[day];
    const weeklyHours = { ...settings.weeklyHours };
    if (current && current.length > 0) delete weeklyHours[day];
    else weeklyHours[day] = [{ ...DEFAULT_INTERVAL }];
    patch({ weeklyHours });
  }

  function setIntervalAt(day: DayKey, index: number, next: Partial<Interval>) {
    if (!settings) return;
    const intervals = [...(settings.weeklyHours[day] ?? [])];
    const current = intervals[index];
    if (!current) return;
    intervals[index] = { ...current, ...next };
    patch({ weeklyHours: { ...settings.weeklyHours, [day]: intervals } });
  }

  function addInterval(day: DayKey) {
    if (!settings) return;
    const intervals = [...(settings.weeklyHours[day] ?? [])];
    intervals.push({ start: "16:00", end: "18:00" });
    patch({ weeklyHours: { ...settings.weeklyHours, [day]: intervals } });
  }

  function removeInterval(day: DayKey, index: number) {
    if (!settings) return;
    const intervals = (settings.weeklyHours[day] ?? []).filter(
      (_, i) => i !== index
    );
    const weeklyHours = { ...settings.weeklyHours };
    if (intervals.length === 0) delete weeklyHours[day];
    else weeklyHours[day] = intervals;
    patch({ weeklyHours });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/calendar/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weeklyHours: settings.weeklyHours,
        slotMinutes: settings.slotMinutes,
        bufferMinutes: settings.bufferMinutes,
        minNoticeHours: settings.minNoticeHours,
        maxDaysAhead: settings.maxDaysAhead,
        timezone: settings.timezone.trim(),
        connector: settings.connector,
        meetingLink: settings.meetingLink?.trim()
          ? settings.meetingLink.trim()
          : null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Couldn't save");
      return;
    }
    const data = (await res.json()) as { settings: Settings };
    setSettings(data.settings);
    setSaved(true);
    void refreshPreview();
  }

  if (!settings) return <p className="text-sm text-text-3">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Business hours</CardTitle>
          <CardDescription>
            Which time slots a customer can book. Hours are in your time zone; a day without slots is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day) => {
            const intervals = settings.weeklyHours[day.key] ?? [];
            const open = intervals.length > 0;
            return (
              <div key={day.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  className={cn(
                    "w-24 shrink-0 rounded-sm px-2 py-1 text-left text-sm font-medium transition-colors sm:mt-1",
                    open
                      ? "bg-brand-tint text-brand-text"
                      : "text-text-3 hover:bg-accent"
                  )}
                >
                  {day.label}
                </button>
                <div className="flex-1 space-y-1.5">
                  {!open && <span className="text-sm text-text-3">Closed</span>}
                  {intervals.map((iv, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={iv.start}
                        onChange={(e) =>
                          setIntervalAt(day.key, i, { start: e.target.value })
                        }
                        className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                      />
                      <span className="text-text-3">to</span>
                      <Input
                        type="time"
                        value={iv.end}
                        onChange={(e) =>
                          setIntervalAt(day.key, i, { end: e.target.value })
                        }
                        className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeInterval(day.key, i)}
                        className="text-sm text-text-3 hover:text-foreground"
                        aria-label="Remove slot"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {open && (
                    <button
                      type="button"
                      onClick={() => addInterval(day.key)}
                      className="text-xs text-brand-text hover:underline"
                    >
                      + another slot
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How openings are generated</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="slot">Appointment length (min)</Label>
            <Input
              id="slot"
              type="number"
              min={10}
              max={240}
              value={settings.slotMinutes}
              onChange={(e) => patch({ slotMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buffer">Travel buffer between appointments (minutes)</Label>
            <Input
              id="buffer"
              type="number"
              min={0}
              max={120}
              value={settings.bufferMinutes}
              onChange={(e) => patch({ bufferMinutes: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Gap after each appointment before the next one can start. Use it for drive time between in-home visits. Stays between 0 and 120. 30 is a good starting point; set it here rather than changing every organization.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice">Minimum notice (hours)</Label>
            <Input
              id="notice"
              type="number"
              min={0}
              max={72}
              value={settings.minNoticeHours}
              onChange={(e) => patch({ minNoticeHours: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ahead">Booking window (days)</Label>
            <Input
              id="ahead"
              type="number"
              min={1}
              max={60}
              value={settings.maxDaysAhead}
              onChange={(e) => patch({ maxDaysAhead: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="tz">Time zone</Label>
            <Input
              id="tz"
              value={settings.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              placeholder="America/New_York"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How the meeting is delivered</CardTitle>
          <CardDescription>
            {"The fixed link doesn't depend on anyone. The others connect with your own provider account and, if one ever fails, the appointment is still booked and the link is left pending a retry."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CONNECTOR_ORDER.map((id) => {
            const meta = CONNECTOR_META[id];
            const active = settings.connector === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patch({ connector: id })}
                className={cn(
                  "block w-full rounded-sm border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-brand bg-brand-tint"
                    : "border-border hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    active && "text-brand-text"
                  )}
                >
                  {meta.label}
                  {!meta.external && (
                    <span className="ml-2 text-[11px] font-normal text-text-3">
                      no dependencies
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-text-2">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {settings.connector === "enlace-fijo" && (
        <Card>
          <CardHeader>
            <CardTitle>Your usual room</CardTitle>
            <CardDescription>
              {"It's shared as-is when an appointment is confirmed. If you leave it empty, appointments are still booked without a link — nobody promises a link that doesn't exist."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={settings.meetingLink ?? ""}
              onChange={(e) => patch({ meetingLink: e.target.value })}
              placeholder="https://…  (optional)"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-sm text-brand-text">Saved</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* Las credenciales se guardan por su cuenta, no con el botón de arriba:
          se validan contra el proveedor antes de tocar la base. */}
      {settings.connector !== "enlace-fijo" && settings.connector !== "in-home" && (
        <ConnectorCredentials connector={settings.connector} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming openings</CardTitle>
          <CardDescription>
            What a customer would be offered right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {slots === null && <p className="text-sm text-text-3">Calculating…</p>}
          {slots?.length === 0 && (
            <p className="text-sm text-text-3">
              No openings: check the hours, the minimum notice or whether everything is booked.
            </p>
          )}
          {slots && slots.length > 0 && (
            <ul className="space-y-1 text-sm">
              {slots.map((s, i) => (
                <li key={i}>{s.label}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
