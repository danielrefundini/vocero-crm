"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Settings → Calendar: the Google calendars linked to the CRM. One of them gets
 * the CRM's appointments; any of them can block busy times and show their
 * events on the CRM calendar.
 */

type Account = {
  id: string;
  email: string;
  writeBookings: boolean;
  blockBusy: boolean;
  showEvents: boolean;
  status: "connected" | "error";
  lastError: string | null;
};

type Data = { configured: boolean; redirectUri: string; canManage: boolean; accounts: Account[] };

const RESULT: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Google calendar linked." },
  canceled: { tone: "bad", text: "Google sign-in was canceled. Nothing was linked." },
  expired: { tone: "bad", text: "That sign-in took too long or came from another session. Try again." },
  failed: { tone: "bad", text: "Google didn't accept the link. Try again in a minute." },
  no_refresh_token: {
    tone: "bad",
    text: "Google didn't give lasting access. Remove the CRM at myaccount.google.com/permissions and connect again.",
  },
  no_calendar_scope: {
    tone: "bad",
    text: "Google didn't give calendar access. Connect again and, on Google's permission screen, tick the box to see and edit your calendar events.",
  },
  owner_only: { tone: "bad", text: "Only the owner can link calendars." },
  not_configured: { tone: "bad", text: "Google sign-in isn't set up on this CRM yet." },
};

export function LinkedCalendarsCard() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/calendar/accounts", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as Data);
    else setError("Couldn't load linked calendars.");
  }, []);

  useEffect(() => {
    void load();
    // The sign-in comes back with ?google=<result>; show it once, then clean the URL.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("google");
    if (code) {
      const r = RESULT[code];
      const email = url.searchParams.get("email");
      if (r) setResult(code === "connected" && email ? { tone: "ok", text: `${email} linked.` } : r);
      url.searchParams.delete("google");
      url.searchParams.delete("email");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [load]);

  async function change(acc: Account, body: Partial<Pick<Account, "writeBookings" | "blockBusy" | "showEvents">>) {
    setBusy(acc.id);
    setError(null);
    const res = await fetch(`/api/calendar/accounts/${acc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError("Couldn't save that change.");
    await load();
    setBusy(null);
  }

  async function remove(acc: Account) {
    if (!window.confirm(`Unlink ${acc.email}? Appointments already copied to it stay in Google.`)) return;
    setBusy(acc.id);
    setError(null);
    const res = await fetch(`/api/calendar/accounts/${acc.id}`, { method: "DELETE" });
    if (!res.ok) setError("Couldn't unlink that calendar.");
    await load();
    setBusy(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Google calendars</CardTitle>
        <CardDescription>
          Link one or more Google accounts. CRM appointments are copied to the one you pick, busy times in any of
          them stop double bookings, and their events show on the CRM calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result && (
          <p
            role="status"
            className={cn(
              "rounded-sm border px-3 py-2 text-sm",
              result.tone === "ok"
                ? "border-success-soft bg-success-tint text-success-text"
                : "border-warning-soft bg-warning-tint text-warning-text"
            )}
          >
            {result.text}
          </p>
        )}
        {error && <p className="text-sm text-danger-text">{error}</p>}
        {!data ? (
          <p className="text-sm text-text-3">Loading…</p>
        ) : (
          <>
            {data.accounts.length === 0 && (
              <p className="text-sm text-text-2">No Google calendar is linked yet.</p>
            )}
            {data.accounts.map((acc) => (
              <div key={acc.id} className="space-y-2.5 rounded-sm border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{acc.email}</p>
                    {acc.status === "error" && (
                      <p className="text-xs text-warning-text">
                        {acc.lastError ?? "Google stopped accepting this link."} Connect it again to fix it.
                      </p>
                    )}
                  </div>
                  <Badge variant={acc.status === "connected" ? "success" : "warning"}>
                    {acc.status === "connected" ? "Connected" : "Needs reconnect"}
                  </Badge>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="write-bookings"
                    checked={acc.writeBookings}
                    disabled={!data.canManage || busy !== null}
                    onChange={() => void change(acc, { writeBookings: true })}
                  />
                  CRM appointments go to this calendar
                </label>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Block its busy times</span>
                  <Switch
                    size="sm"
                    label={`Block busy times from ${acc.email}`}
                    checked={acc.blockBusy}
                    disabled={!data.canManage || busy !== null}
                    onCheckedChange={(v) => void change(acc, { blockBusy: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Show its events on the CRM calendar</span>
                  <Switch
                    size="sm"
                    label={`Show events from ${acc.email}`}
                    checked={acc.showEvents}
                    disabled={!data.canManage || busy !== null}
                    onCheckedChange={(v) => void change(acc, { showEvents: v })}
                  />
                </div>
                {data.canManage && (
                  <div className="flex gap-2 pt-1">
                    {acc.status === "error" && (
                      <a
                        href={`/api/calendar/google/connect?email=${encodeURIComponent(acc.email)}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Reconnect
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void remove(acc)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {data.accounts.length > 0 && !data.accounts.some((a) => a.writeBookings) && (
              <p className="text-xs text-text-3">
                {"No calendar is picked for appointments, so they stay in the CRM only."}
              </p>
            )}
            {!data.canManage ? (
              <p className="text-xs text-text-3">Only the owner can link or change calendars.</p>
            ) : data.configured ? (
              <a href="/api/calendar/google/connect" className={buttonVariants({ variant: "default" })}>
                {data.accounts.length ? "Connect another Google account" : "Connect Google"}
              </a>
            ) : (
              <div className="space-y-1 rounded-sm border border-dashed border-border-strong px-3 py-2.5 text-xs text-text-2">
                <p className="font-semibold text-foreground">Google sign-in isn&apos;t set up yet</p>
                <p>
                  Create a Google Cloud OAuth client (Web application) with the Calendar API on, add this
                  authorized redirect URI, then set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.
                </p>
                <code className="block break-all rounded-sm bg-subtle px-2 py-1">{data.redirectUri}</code>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
