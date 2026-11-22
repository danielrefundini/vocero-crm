"use client";

import { AlertTriangle, ArrowUpRight, Cable, Info, Power, Send, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  despachoFallando,
  externalBrainName,
  externalDown,
  haceCuanto,
  type BrainDispatchDto,
  type BrainHealthDto,
  type BrainRelayDto,
  type BrainStatusDto,
} from "@/lib/brain-status";
import { GUIA_DEL_PAR_URL } from "@/lib/guia-del-par";
import { cn } from "@/lib/utils";

/**
 * «Quién responde a tus clientes»: arriba de la pantalla del Agente.
 *
 * 036 — Vocero no trae agente: contesta el cerebro que se conecta al lado
 * (Nea u otro) y solo si el interruptor de esta página está encendido (el CRM
 * le despacha). Sin cerebro, Vocero es una bandeja manual: el aviso
 * `sin_cerebro` informa, no alarma. Con cerebro y el interruptor apagado,
 * `apagado` sí avisa: nadie contesta en automático.
 */

type Tone = "ok" | "warn" | "off";
type RowView = { tone: Tone; headline: string; detail: string | null };

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-border-strong",
};

export function BrainStatusCard({
  status,
  now = Date.now(),
}: {
  status: BrainStatusDto;
  now?: number;
}) {
  const lastSeenAt = status.external.lastSeenAt;

  return (
    <Card data-brain-card data-warning={status.warning ?? "ninguno"}>
      <CardHeader className="pb-4">
        <CardTitle>Who replies to your customers</CardTitle>
        <CardDescription>
          This CRM does not include an agent. Replies come from the brain you connect beside it
          (Nea, or your own), and only while the switch above is on. Without that, you reply from the inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.warning === "sin_cerebro" && (
          <Callout tone="info" icon={Info} title="No agent connected">
            This stays a manual inbox: customers get the replies you send. To let an agent reply,
            run one beside the CRM and set <Env>BRAIN_DISPATCH_URL</Env> and <Env>BOT_API_KEY</Env>.
            Leave the agent model key empty so it uses the Claude model already saved in Settings → AI.
            See docs/agent-setup.md.{" "}
            <a
              href={GUIA_DEL_PAR_URL}
              className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
            >
              How to connect it
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a>
          </Callout>
        )}
        {status.warning === "apagado" && (
          <Callout tone="warning" icon={AlertTriangle} title="Your agent is connected but switched off">
            Turn it on with the switch above so it can reply. Until then nobody replies automatically:
            messages wait in the inbox.
          </Callout>
        )}

        <dl className="divide-y rounded-md border">
          <BrainRow
            id="external"
            icon={Cable}
            label="Your agent"
            hint="The brain that answers (Nea or another), through the CRM API."
            view={externalView(status, now)}
          />
          {(status.dispatch.host !== null || status.dispatch.problem !== null) && (
            <BrainRow
              id="dispatch"
              icon={Send}
              label="Agent dispatch"
              hint="The CRM hands it each turn; the webhook never leaves here."
              view={dispatchView(status.dispatch, now)}
            />
          )}
          <BrainRow
            id="switch"
            icon={Power}
            label="Agent switch"
            hint="When on, the CRM dispatches messages to your agent."
            view={switchView(status)}
          />
        </dl>

        {lastSeenAt && (
          <p className="text-[11px] text-text-3">
            {"Your agent's last call is counted since the CRM's last start."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function switchView(s: BrainStatusDto): RowView {
  const headline = s.enabled ? "On" : "Off";
  if (!s.dispatch.active) {
    return {
      tone: "off",
      headline,
      detail: "With no agent connected there's nobody to dispatch to: it turns on once you connect it.",
    };
  }
  if (!s.enabled) {
    return { tone: "warn", headline, detail: "The CRM hands nothing to your agent: nobody answers automatically." };
  }
  if (externalDown(s)) {
    return { tone: "warn", headline, detail: "But your agent isn't online: it won't answer until it's back." };
  }
  return { tone: "ok", headline, detail: "The CRM hands every message to your agent." };
}

function externalView(s: BrainStatusDto, now: number): RowView {
  const { keyConfigured, lastSeenAt, active, health } = s.external;
  const llamada = lastSeenAt
    ? `last call ${haceCuanto(lastSeenAt, now)}`
    : "no calls since the last start";

  if (health?.reachable) {
    const name = externalBrainName(s);
    const parts = [
      name,
      "online",
      health.version && versionLabel(health.version),
      health.mode && `modo ${health.mode}`,
      health.relay && relayLabel(health.relay),
    ].filter(Boolean);
    return keyConfigured
      ? { tone: "ok", headline: capitalize(parts.join(" · ")), detail: `${capitalize(llamada)}.` }
      : {
          tone: "warn",
          headline: capitalize(parts.join(" · ")),
          detail: "The CRM is missing BOT_API_KEY: it can't answer through the API.",
        };
  }
  if (health?.problem === "config") {
    return {
      tone: "warn",
      headline: "Can't check its status",
      detail: `BRAIN_HEALTH_URL is not a valid http:// or https:// URL (e.g. http://nea:8000/health): fix it and redeploy the CRM.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (health) {
    const name = externalBrainName(s);
    return {
      tone: "warn",
      headline: capitalize(`${name ? `${name} · ` : ""}is not online`),
      detail: `${health.host} ${problemLabel(health)}.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (keyConfigured) {
    return { tone: active ? "ok" : "off", headline: `Key configured · ${llamada}`, detail: null };
  }
  return { tone: "off", headline: "No agent connected", detail: null };
}

function dispatchView(d: BrainDispatchDto, now: number): RowView {
  const mientras = "Meanwhile nobody answers automatically.";
  if (d.problem === "url") {
    return {
      tone: "warn",
      headline: "Can't dispatch",
      detail: `BRAIN_DISPATCH_URL is not a valid http:// or https:// URL, or it includes a username and password (e.g. http://nea:8000/vocero/dispatch): fix it and redeploy the CRM. ${mientras}`,
    };
  }
  if (d.problem === "sin_llave") {
    return {
      tone: "warn",
      headline: "Can't dispatch",
      detail: `BOT_API_KEY is missing (minimum 16 characters): it signs every turn and the brain answers with it. ${mientras}`,
    };
  }
  const espera =
    d.pending > 0
      ? ` ${d.pending === 1 ? "1 turn waiting" : `${d.pending} turns waiting`}.`
      : "";
  if (d.lastFailure && despachoFallando(d)) {
    return {
      tone: "warn",
      headline: `Active · ${d.host} · the last turn didn't arrive`,
      detail: `${capitalize(d.lastFailure.detail)} (${haceCuanto(d.lastFailure.at, now)}). After three failed attempts, the conversation goes to a person.${espera}`,
    };
  }
  return {
    tone: "ok",
    headline: `Active · ${d.host}`,
    detail: d.lastDeliveredAt
      ? `Last turn delivered ${haceCuanto(d.lastDeliveredAt, now)}.${espera}`
      : `No turn has been dispatched yet.${espera}`,
  };
}

function versionLabel(v: string): string {
  return /^v/i.test(v) ? v : `v${v}`;
}

function relayLabel(r: BrainRelayDto): string | null {
  if (r.pendientes === null) return null;
  const base = r.pendientes === 1 ? "1 message to hand off" : `${r.pendientes} messages to hand off`;
  if (r.pendientes > 0 && r.masViejoSegundos !== null && r.masViejoSegundos >= 60) {
    return `${base} (the oldest, from ${Math.floor(r.masViejoSegundos / 60)} min ago)`;
  }
  return base;
}

function problemLabel(h: BrainHealthDto): string {
  switch (h.problem) {
    case "timeout":
      return "didn't answer within 2 s";
    case "status":
      return `answered ${h.httpStatus ?? "with an error"}`;
    case "redirect":
      return "answered with a redirect (not followed)";
    case "invalid":
      return "answered, but not with its status";
    default:
      return "refuses the connection";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BrainRow({
  id,
  icon: Icon,
  label,
  hint,
  view,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  view: RowView;
}) {
  return (
    <div
      data-brain-row={id}
      data-tone={view.tone}
      className="grid gap-1.5 p-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4 sm:p-4"
    >
      <dt className="flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </dt>
      <dd className="flex min-w-0 items-start gap-2 pl-[26px] sm:pl-0">
        <span aria-hidden className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", DOT[view.tone])} />
        <div className="min-w-0">
          <p className="break-words text-sm">{view.headline}</p>
          {view.detail && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{view.detail}</p>
          )}
        </div>
      </dd>
    </div>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "info" | "warning";
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-callout={tone}
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-3",
        // Informativo en gris: una bandeja manual es un producto válido, no
        // un error que haya que corregir.
        tone === "info"
          ? "bg-subtle text-foreground"
          : "border-warning-soft bg-warning-tint text-warning-text"
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "info" && "text-text-3")}
        strokeWidth={1.8}
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className={cn("mt-0.5 leading-relaxed", tone === "info" && "text-text-2")}>{children}</p>
      </div>
    </div>
  );
}

/** El nombre de una variable, entero: partido a media palabra en el móvil no
 *  se puede copiar ni reconocer. */
function Env({ children }: { children: React.ReactNode }) {
  return <code className="whitespace-nowrap font-mono text-[0.92em]">{children}</code>;
}
