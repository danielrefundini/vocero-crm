"use client";

import { useEffect, useState } from "react";
import {
  BRAND_LABEL,
  BRANDS,
  SERVICE_LABEL,
  SERVICE_TYPES,
  type Brand,
  type ServiceType,
} from "@/lib/exteriors";
import { parseMoneyToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ExteriorsValue = {
  email: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  services: ServiceType[];
  brand: Brand | "";
  quoteAmount: string;
  quoteDate: string;
};

export const EMPTY_EXTERIORS: ExteriorsValue = {
  email: "",
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  services: [],
  brand: "daniel_exteriors",
  quoteAmount: "",
  quoteDate: "",
};

export function ExteriorsFields({
  value,
  onChange,
}: {
  value: ExteriorsValue;
  onChange: (next: ExteriorsValue) => void;
}) {
  function set<K extends keyof ExteriorsValue>(key: K, next: ExteriorsValue[K]) {
    onChange({ ...value, [key]: next });
  }

  function toggle(service: ServiceType) {
    const has = value.services.includes(service);
    set(
      "services",
      has ? value.services.filter((item) => item !== service) : [...value.services, service]
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="ex-email">
          Email
        </label>
        <Input
          id="ex-email"
          type="email"
          value={value.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="name@email.com"
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Property address</legend>
        <Input
          aria-label="Street"
          value={value.addressStreet}
          onChange={(e) => set("addressStreet", e.target.value)}
          placeholder="123 Main St"
        />
        <div className="grid grid-cols-6 gap-2">
          <Input
            aria-label="City"
            className="col-span-3"
            value={value.addressCity}
            onChange={(e) => set("addressCity", e.target.value)}
            placeholder="Rockville"
          />
          <Input
            aria-label="State"
            className="col-span-1"
            value={value.addressState}
            onChange={(e) => set("addressState", e.target.value.toUpperCase())}
            placeholder="MD"
            maxLength={2}
          />
          <Input
            aria-label="ZIP"
            className="col-span-2"
            value={value.addressZip}
            onChange={(e) => set("addressZip", e.target.value)}
            placeholder="20850"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Service type</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SERVICE_TYPES.map((service) => {
            const on = value.services.includes(service);
            return (
              <button
                key={service}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(service)}
                className={
                  on
                    ? "rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-brand-fg"
                    : "rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                }
              >
                {SERVICE_LABEL[service]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="ex-amount">
            Quote amount (USD)
          </label>
          <Input
            id="ex-amount"
            inputMode="decimal"
            value={value.quoteAmount}
            onChange={(e) => set("quoteAmount", e.target.value)}
            placeholder="12500.00"
          />
          <p className="text-[11px] text-muted-foreground">Leave blank if it has not been quoted.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="ex-date">
            Quote date
          </label>
          <Input
            id="ex-date"
            type="date"
            value={value.quoteDate}
            onChange={(e) => set("quoteDate", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="ex-brand">
          Brand
        </label>
        <select
          id="ex-brand"
          value={value.brand}
          onChange={(e) => set("brand", e.target.value as Brand | "")}
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
        >
          <option value="">Not set</option>
          {BRANDS.map((brand) => (
            <option key={brand} value={brand}>
              {BRAND_LABEL[brand]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type LoadedContact = {
  email?: string | null;
  address?: { street: string | null; city: string | null; state: string | null; zip: string | null };
  services?: ServiceType[];
  deal?: {
    id: string;
    amountCents: number | null;
    quoteDate: string | null;
    brand: Brand | null;
  } | null;
};

export function ExteriorsEditor({ contactId, refreshKey = 0 }: { contactId: string; refreshKey?: number }) {
  const [value, setValue] = useState<ExteriorsValue>(EMPTY_EXTERIORS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const res = await fetch(`/api/contacts/${contactId}`).catch(() => null);
      if (!res?.ok || cancel) return;
      const data = (await res.json()) as { contact?: LoadedContact };
      const c = data.contact;
      if (!c || cancel) return;
      setValue({
        email: c.email ?? "",
        addressStreet: c.address?.street ?? "",
        addressCity: c.address?.city ?? "",
        addressState: c.address?.state ?? "",
        addressZip: c.address?.zip ?? "",
        services: c.services ?? [],
        brand: c.deal?.brand ?? "daniel_exteriors",
        quoteAmount: c.deal?.amountCents == null ? "" : (c.deal.amountCents / 100).toFixed(2),
        quoteDate: c.deal?.quoteDate ?? "",
      });
    })();
    return () => {
      cancel = true;
    };
  }, [contactId, refreshKey]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const amount = value.quoteAmount.trim();
    const cents = amount ? parseMoneyToCents(amount) : null;
    if (amount && cents === null) {
      setSaving(false);
      setError("Quote amount must be a number. Leave it blank if there is no quote yet.");
      return;
    }
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: value.email.trim() || null,
        addressStreet: value.addressStreet,
        addressCity: value.addressCity,
        addressState: value.addressState,
        addressZip: value.addressZip,
        services: value.services,
        brand: value.brand || null,
        amountCents: cents,
        quoteDate: value.quoteDate || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Could not save");
      return;
    }
    setSaved(true);
  }

  return (
    <section className="space-y-3 border-b p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property & quote</p>
      <ExteriorsFields value={value} onChange={setValue} />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save property & quote"}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
