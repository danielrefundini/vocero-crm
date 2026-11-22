"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import {
  countVariables,
  renderBody,
  templateWarnings,
  validateBodyVariables,
} from "@/lib/templates";
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  TEMPLATE_LANGUAGE_GROUPS,
  TEMPLATE_LANGUAGES,
  templateLanguageName,
} from "@/lib/template-languages";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = "UTILITY" | "MARKETING";

const STATUS_BADGE: Record<
  TemplateDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive"; hint: string }
> = {
  draft: { label: "Draft", variant: "secondary", hint: "Saved, not yet sent to Meta." },
  pending: { label: "In review", variant: "warning", hint: "Meta is reviewing it. It usually takes from a few minutes to 24 hours." },
  approved: { label: "Approved", variant: "success", hint: "Ready to use from the Inbox or from Contacts." },
  rejected: { label: "Rejected", variant: "destructive", hint: "Fix it and create it again with another name." },
};

const CATEGORY: Record<Category, { label: string; description: string }> = {
  UTILITY: {
    label: "Utility",
    description: "Follow-up on something the customer asked for: an appointment, a quote, an order.",
  },
  MARKETING: {
    label: "Marketing",
    description: "Promotions, offers, invitations or re-engaging someone who didn't buy.",
  },
};

/** Puntos de partida: rellenan el formulario, el dueño los ajusta a su negocio. */
const STARTERS: {
  title: string;
  name: string;
  category: Category;
  body: string;
  examples: string[];
}[] = [
  {
    title: "Quote follow-up",
    name: "seguimiento_cotizacion",
    category: "UTILITY",
    body: "Hi {{1}}, I'm following up on the quote we sent you. Do you have any questions, or would you like to go over it together?",
    examples: ["Ana"],
  },
  {
    title: "Appointment reminder",
    name: "recordatorio_cita",
    category: "UTILITY",
    body: "Hi {{1}}, this is a reminder of your appointment on {{2}} at {{3}}. If you need to change it, reply to this message.",
    examples: ["Ana", "Tuesday, October 14", "10:30"],
  },
  {
    title: "Resume the conversation",
    name: "retomar_conversacion",
    category: "MARKETING",
    body: "Hi {{1}}, are you still interested in {{2}}? We have openings this week. Reply to this message and we'll help you.",
    examples: ["Ana", "the dental cleaning"],
  },
];

/** Meta solo acepta minúsculas, números y guion bajo en el nombre. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<TemplateDto[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/templates").catch(() => null);
    if (!res?.ok) {
      setTemplates((current) => current ?? []);
      return;
    }
    const data = (await res.json()) as { templates: TemplateDto[] };
    setTemplates(data.templates);
  }, []);

  /**
   * `silent`: sincronización automática al abrir la pantalla. Meta entrega
   * `message_template_status_update` al callback A NIVEL APP, que en modo
   * agencia no es el de esta instancia — sin este pull la plantilla se queda
   * "Pendiente de Meta" para siempre aunque ya esté aprobada.
   */
  const sync = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setSyncing(true);
        setSyncMsg(null);
      }
      const res = await fetch("/api/templates/sync", { method: "POST" }).catch(
        () => null
      );
      if (!silent) setSyncing(false);
      if (res?.ok) {
        const data = (await res.json()) as { updated: number };
        if (!silent) {
          setSyncMsg(
            data.updated > 0
              ? `${data.updated} template(s) updated`
              : "All up to date"
          );
        }
        if (!silent || data.updated > 0) void refetch();
      } else if (!silent) {
        // El auto-sync falla en silencio: la lista local ya se pintó.
        const data = (await res?.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setSyncMsg(data?.error?.message ?? "Couldn't sync");
      }
    },
    [refetch]
  );

  useEffect(() => {
    void refetch().then(() => sync({ silent: true }));
  }, [refetch, sync]);

  const empty = templates !== null && templates.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <HowItWorks defaultOpen={empty} />

      <section className="space-y-3" aria-labelledby="tpl-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="tpl-list-title" className="text-base font-semibold">
            Your templates
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={() => void sync()}
              title="Ask Meta for the review status"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Refresh status
            </Button>
            {!creating && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New template
              </Button>
            )}
          </div>
        </div>
        {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}

        {creating && (
          <CreateForm
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void refetch();
            }}
          />
        )}

        {templates === null ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : empty ? (
          !creating && (
            <EmptyState
              icon={FileText}
              className="rounded-lg border border-dashed"
              title="You don't have templates yet"
              description="Create the first one so you can message a customer after 24 hours. You can start from an example."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  Crear mi primera plantilla
                </Button>
              }
            />
          )
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm font-medium">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {templateLanguageName(t.language)} ·{" "}
                      {CATEGORY[t.category as Category]?.label ?? t.category}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[t.status].variant}>
                    {STATUS_BADGE[t.status].label}
                  </Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{t.body}</p>
                <p
                  className={cn(
                    "mt-3 text-xs",
                    t.status === "rejected" ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {t.status === "rejected" && t.rejectionReason
                    ? `Rejection reason: ${t.rejectionReason}. ${STATUS_BADGE.rejected.hint}`
                    : STATUS_BADGE[t.status].hint}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** La explicación: para qué sirven, cómo se aprueban y dónde se usan. */
function HowItWorks({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // Se abre sola la primera vez que la lista llega vacía.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const steps = [
    {
      icon: Plus,
      title: "Create it here",
      text: "Write the message and mark with {{1}}, {{2}}… what changes in each send, like the name or the date.",
    },
    {
      icon: Clock3,
      title: "Meta reviews it",
      text: "It takes from a few minutes to 24 hours. The status changes on its own to «Approved» or «Rejected», with the reason.",
    },
    {
      icon: Send,
      title: "Use it",
      text: "In the Inbox, when the 24 h window is closed, pick it, fill in the variables and send. To message someone first, use «Message first» in Contacts.",
    },
  ];

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">What are templates for?</span>
          <span className="block text-xs text-muted-foreground">
            {"They're the only message WhatsApp lets you send after 24 hours."}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t p-4 text-sm">
          <p className="text-muted-foreground">
            {"WhatsApp only lets you write freely during the 24 hours after your customer's last message. After that —or to message someone who has never written to you— you need a message Meta approved beforehand: a template."}
          </p>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-md border bg-background p-3">
                <p className="flex items-center gap-2 font-medium">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  {s.title}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <details className="rounded-md bg-subtle p-3">
            <summary className="cursor-pointer font-medium">Tips for getting Meta to approve it</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{"Don't start or end the message with a variable, and don't put two variables together."}</li>
              <li>{"Say who's writing and why: «Hi"} {"{{1}}"}, this is Ana from Sun Clinic…».</li>
              <li>{"Write real examples for each variable: it's what the reviewer sees."}</li>
              <li>Utility is only for following up on something the customer asked for. If the message promotes something, Meta switches it to Marketing, which costs more per conversation.</li>
              <li>The language you pick must match the text.</li>
            </ul>
          </details>
          <p className="flex flex-wrap gap-4 text-xs">
            <Link className="inline-flex items-center gap-1 underline" href="/inbox">
              <Inbox className="h-3.5 w-3.5" /> Go to the Inbox
            </Link>
            <Link className="inline-flex items-center gap-1 underline" href="/contacts">
              <Send className="h-3.5 w-3.5" /> Go to Contacts
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

function CreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(DEFAULT_TEMPLATE_LANGUAGE);
  const [category, setCategory] = useState<Category>("UTILITY");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Misma validación que el servidor: avisa antes de gastar una llamada a Meta.
  const bodyError = body.trim() ? validateBodyVariables(body) : null;
  const variableCount = bodyError ? 0 : countVariables(body);
  const warnings = bodyError ? [] : templateWarnings(body);
  const preview = renderBody(
    body,
    Array.from({ length: variableCount }, (_, i) => examples[i]?.trim() || `[variable ${i + 1}]`)
  );

  function applyStarter(s: (typeof STARTERS)[number]) {
    setName(s.name);
    setCategory(s.category);
    setBody(s.body);
    setExamples(s.examples);
    setError(null);
  }

  /** Inserta la siguiente variable donde está el cursor. */
  function insertVariable() {
    const next = `{{${countVariables(body) + 1}}}`;
    const el = document.getElementById("tpl-body") as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const value = body.slice(0, start) + next + body.slice(end);
    setBody(value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + next.length, start + next.length);
    });
  }

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        language,
        category,
        body,
        examples: examples.slice(0, variableCount),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Couldn't create the template");
      return;
    }
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New template</CardTitle>
        <CardDescription>
          {"It's sent to Meta for review when created. While it's under review you can keep using the CRM."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Start from an example (optional)</p>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button key={s.name} type="button" variant="outline" size="sm" onClick={() => applyStarter(s)}>
                {s.title}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Internal name</Label>
            <Input
              id="tpl-name"
              placeholder="quote_follow_up"
              value={name}
              onChange={(e) => setName(normalizeName(e.target.value))}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              {"Only lowercase letters, numbers and underscores. Your customers don't see it."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">Message language</Label>
            <select
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              {TEMPLATE_LANGUAGE_GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {TEMPLATE_LANGUAGES.filter((l) => l.group === g.id).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">What is it for?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(CATEGORY) as Category[]).map((c) => (
              <label
                key={c}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-sm transition-colors",
                  category === c ? "border-primary bg-brand-tint" : "hover:bg-accent"
                )}
              >
                <input
                  type="radio"
                  name="tpl-category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  className="sr-only"
                />
                <span className="block font-medium">{CATEGORY[c].label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{CATEGORY[c].description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="tpl-body">Message</Label>
            <Button type="button" variant="ghost" size="sm" onClick={insertVariable}>
              <Plus className="h-3.5 w-3.5" />
              Insert variable {`{{${countVariables(body) + 1}}}`}
            </Button>
          </div>
          <Textarea
            id="tpl-body"
            rows={4}
            placeholder="Hi {{1}}, confirming your session on {{2}} at {{3}}. If you need to move it, reply to this message."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {bodyError ? (
            <p className="text-xs text-destructive">{bodyError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Variables are filled in when sending: {"{{1}}"} {"could be the customer's name,"} {"{{2}}"} a date…
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>

        {variableCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Example for each variable</p>
            <p className="text-xs text-muted-foreground">
              {"Meta uses them to review the template. They aren't sent to your customers."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: variableCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Label htmlFor={`tpl-example-${i + 1}`} className="w-10 shrink-0 font-mono text-xs">
                    {`{{${i + 1}}}`}
                  </Label>
                  <Input
                    id={`tpl-example-${i + 1}`}
                    placeholder={i === 0 ? "Ana" : "e.g. Tuesday 14"}
                    value={examples[i] ?? ""}
                    onChange={(e) => {
                      const next = [...examples];
                      next[i] = e.target.value;
                      setExamples(next);
                    }}
                    maxLength={200}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {body.trim() && !bodyError && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">This is how your customer will see it</p>
            <div className="rounded-lg bg-chat p-4">
              <div className="ml-auto max-w-[85%] rounded-lg border border-bubble-out-border bg-bubble-out px-3 py-2 text-sm text-bubble-out-text shadow-sm">
                <p className="whitespace-pre-wrap">{preview}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">10:30</p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={saving || !name.trim() || !body.trim() || bodyError !== null}
            onClick={() => void create()}
          >
            {saving ? "Sending to Meta…" : "Create and send for review"}
          </Button>
          <Button variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          When Meta approves it, it will appear in the Inbox, ready to send.
        </p>
      </CardContent>
    </Card>
  );
}
