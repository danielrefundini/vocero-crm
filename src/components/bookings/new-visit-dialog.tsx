"use client";

import { useEffect, useState } from "react";
import { blockStartUtc } from "@/lib/time/calendar";
import { CONNECTOR_META, CONNECTOR_ORDER, type ConnectorId } from "@/lib/agenda-connectors";
import { formatAddress } from "@/lib/exteriors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Hit = {
  id: string;
  name: string;
  phone: string | null;
  address?: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    formatted: string;
  };
};

export function NewVisitDialog({
  day,
  time,
  timezone,
  onCancel,
  onCreated,
}: {
  day: string;
  time: string;
  timezone: string;
  onCancel: () => void;
  onCreated: (day: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [contact, setContact] = useState<Hit | null>(null);
  const [whenDay, setWhenDay] = useState(day);
  const [whenTime, setWhenTime] = useState(time);
  const [connector, setConnector] = useState<ConnectorId>("in-home");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      void fetch(`/api/contacts?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { contacts?: Hit[] } | null) => setHits(data?.contacts?.slice(0, 6) ?? []))
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  function choose(hit: Hit) {
    setContact(hit);
    setQuery(hit.name);
    setHits([]);
    if (hit.address?.formatted) setAddress(hit.address.formatted);
    else if (hit.address) {
      setAddress(
        formatAddress({
          street: hit.address.street,
          city: hit.address.city,
          state: hit.address.state,
          zip: hit.address.zip,
        })
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) {
      setError("Pick a contact.");
      return;
    }
    const startUtc = blockStartUtc(whenDay, whenTime, timezone);
    if (!startUtc) {
      setError("That time does not exist in the business timezone.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "session",
        contactId: contact.id,
        startUtc,
        connector,
        propertyAddress: connector === "in-home" ? address.trim() || null : null,
      }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status !== 201) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Could not book that visit");
      return;
    }
    onCreated(whenDay);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-label="New visit"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <h3 className="mb-3 font-semibold">New appointment</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="visit-contact">Contact</Label>
            <Input
              id="visit-contact"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setContact(null);
              }}
              placeholder="Search by name"
            />
            {hits.length > 0 && (
              <ul className="rounded-md border">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => choose(hit)}>
                      {hit.name}
                      {hit.phone ? <span className="ml-2 text-muted-foreground">{hit.phone}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="visit-day">Day</Label>
              <Input id="visit-day" type="date" value={whenDay} onChange={(e) => setWhenDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visit-time">Time</Label>
              <Input id="visit-time" type="time" value={whenTime} onChange={(e) => setWhenTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-type">Type</Label>
            <select
              id="visit-type"
              value={connector}
              onChange={(e) => setConnector(e.target.value as ConnectorId)}
              className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
            >
              {CONNECTOR_ORDER.map((id) => (
                <option key={id} value={id}>
                  {CONNECTOR_META[id].label}
                </option>
              ))}
            </select>
          </div>
          {connector === "in-home" && (
            <div className="space-y-1.5">
              <Label htmlFor="visit-address">Property address</Label>
              <Input
                id="visit-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Rockville, MD 20850"
              />
              <p className="text-[11px] text-muted-foreground">
                Saved on the appointment and turned into a Google Maps link. You can still save the visit if this is empty.
              </p>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Book"}
          </Button>
        </div>
      </form>
    </div>
  );
}
