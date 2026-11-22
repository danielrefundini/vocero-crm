"use client";

import { useEffect, useState } from "react";
import type { SourceValue, StageDto } from "@/lib/types";
import { parseMoneyToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExteriorsFields, EMPTY_EXTERIORS, type ExteriorsValue } from "@/components/exteriors/exteriors-fields";

const SOURCES: { value: SourceValue; label: string }[] = [
  { value: "referido", label: "Referral" },
  { value: "organico", label: "Organic / website" },
  { value: "conocido", label: "Someone I know" },
  { value: "anuncio", label: "Ad" },
  { value: "otro", label: "Other" },
];

/**
 * Alta manual. El teléfono, si viene, es de EE. UU. (10 dígitos o con el 1).
 * Un lead solo con email también vale: el seguimiento sale por correo.
 */
export function NewContactDialog({
  onClose,
  onCreated,
  onOpenExisting,
}: {
  onClose: () => void;
  onCreated: () => void;
  onOpenExisting: (contactId: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<SourceValue>("referido");
  const [notes, setNotes] = useState("");
  const [exteriors, setExteriors] = useState<ExteriorsValue>(EMPTY_EXTERIORS);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [stageId, setStageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pipeline/stages").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { stages: StageDto[] };
      const open = data.stages.filter((s) => s.kind === "open");
      setStages(open);
      setStageId(open[0]?.id ?? "");
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setDuplicate(null);
    const amount = exteriors.quoteAmount.trim();
    const cents = amount ? parseMoneyToCents(amount) : null;
    if (amount && cents === null) {
      setSaving(false);
      setError("Quote amount must be a number, or left blank.");
      return;
    }
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: exteriors.email.trim() || undefined,
        source,
        notes: notes.trim() || undefined,
        stageId: stageId || undefined,
        addressStreet: exteriors.addressStreet || undefined,
        addressCity: exteriors.addressCity || undefined,
        addressState: exteriors.addressState || undefined,
        addressZip: exteriors.addressZip || undefined,
        services: exteriors.services,
        brand: exteriors.brand || undefined,
        amountCents: amount ? cents : undefined,
        quoteDate: exteriors.quoteDate || undefined,
      }),
    }).catch(() => null);
    setSaving(false);

    if (!res) {
      setError("Could not save. Check your connection.");
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      contact?: { id: string; name: string };
    } | null;

    if (res.status === 409 && data?.contact) {
      setDuplicate({ id: data.contact.id, name: data.contact.name });
      return;
    }
    if (!res.ok) {
      setError(data?.error?.message ?? "Could not save the contact");
      return;
    }
    onCreated();
  }

  const digits = phone.replace(/\D/g, "").length;
  const phoneOk = digits === 0 || digits === 10 || digits >= 11;
  const ready =
    name.trim().length > 0 && (digits > 0 || exteriors.email.trim().length > 0) && phoneOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="New contact"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">New contact</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          For people who did not message you on WhatsApp: referrals, website leads, neighbors.
          Use a US phone (10 digits, or starting with 1) or an email.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-name">
              Name
            </label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Lee"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-phone">
              Phone
            </label>
            <Input
              id="nc-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="202 555 0147"
            />
            <p className="text-[11px] text-muted-foreground">
              10 digits is enough. Country code 1 is added for you. Include it if you paste a full number.
            </p>
          </div>

          <ExteriorsFields value={exteriors} onChange={setExteriors} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-source">
                Where did they come from?
              </label>
              <select
                id="nc-source"
                value={source}
                onChange={(e) => setSource(e.target.value as SourceValue)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-stage">
                Starting stage
              </label>
              <select
                id="nc-stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-notes">
              Notes (optional)
            </label>
            <Textarea
              id="nc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Roof and gutters on a ranch in Gaithersburg."
            />
          </div>
        </div>

        {duplicate && (
          <div className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2.5">
            <p className="text-[13px] text-warning-text">
              That phone or email already belongs to <strong>{duplicate.name}</strong>. No duplicate was created.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => onOpenExisting(duplicate.id)}
            >
              Open {duplicate.name}
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}
