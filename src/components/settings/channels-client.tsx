"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { ChannelBadge } from "@/components/channel-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

/**
 * 023 — Ajustes → Canales → Estado.
 *
 * Una fila por canal encendido con las tres cosas que alguien pregunta cuando
 * «no me llegan los mensajes»: ¿está conectado?, ¿cuándo entró el último? y,
 * si llega por Zernio, ¿siguen bien la cuenta y el webhook? La salud se le
 * pregunta a Zernio al abrir la pantalla; nada de esto se guarda.
 */

type Level = "ok" | "warn" | "error";
type Health = { level: Level; message: string };

type ChannelSwitch = { channel: Channel; on: boolean };

/** One line under each switch, so the owner knows what it turns on. */
const SWITCH_HINT: Partial<Record<Channel, string>> = {
  instagram: "Instagram DMs, through Zernio",
  messenger: "Facebook Page messages, through Zernio",
  tiktok: "TikTok Business DMs, through Zernio",
  telegram: "A Telegram bot",
  website: "Leads from your website's forms",
};

type Row = {
  channel: Channel;
  connected: boolean;
  source: "meta" | "zernio" | "telegram" | "website" | null;
  account: string | null;
  status: "connected" | "reconnect_required" | null;
  lastInboundAt: string | null;
  health: {
    account: Health;
    webhook: Health & { lastFiredAt: string | null; failureCount: number };
  } | null;
};

const SETTINGS_HREF: Record<Channel, string> = {
  whatsapp: "/settings/whatsapp",
  instagram: "/settings/instagram",
  messenger: "/settings/messenger",
  tiktok: "/settings/tiktok",
  telegram: "/settings/telegram",
  website: "/settings/website",
  sms: "/settings/follow-up",
  email: "/settings/follow-up",
};

const DOT: Record<Level, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
};

/** «hace 5 min», «hace 3 h», «hace 2 días». */
function hace(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function ChannelsClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // La hora se fija al cargar: leer el reloj durante el render hace que el
  // servidor y el navegador pinten textos distintos.
  const [now, setNow] = useState(0);
  const [switches, setSwitches] = useState<ChannelSwitch[]>([]);
  const [saving, setSaving] = useState<Channel | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const router = useRouter();

  const refetch = useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/settings/channels")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setLoading(false);
    setNow(Date.now());
    if (!data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data.channels);
    setCanManage(Boolean(data.canManage));
    setSwitches(data.switches ?? []);
  }, []);

  useEffect(() => {
    void refetch();
    // La URL para quien prefiera crear el webhook a mano en Zernio: cualquiera
    // de las tres sirve, porque el CRM reparte por red.
    void fetch("/api/settings/webhook")
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => setWebhookUrl(w?.instagramUrl ?? w?.messengerUrl ?? w?.tiktokUrl ?? null))
      .catch(() => null);
  }, [refetch]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin portapapeles (contexto no seguro): el texto sigue visible
    }
  }

  async function toggle(channel: Channel, next: boolean) {
    setSaving(channel);
    setSwitchError(null);
    const on = switches
      .filter((s) => (s.channel === channel ? next : s.on))
      .map((s) => s.channel);
    const res = await fetch("/api/settings/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as {
      switches?: ChannelSwitch[];
      error?: { message?: string };
    } | null;
    setSaving(null);
    if (!res?.ok || !data?.switches) {
      setSwitchError(data?.error?.message ?? "Couldn't save. Try again.");
      return;
    }
    setSwitches(data.switches);
    // The menu and the inbox read the switches on the server: redraw them.
    router.refresh();
    void refetch();
  }

  async function repair() {
    setRepairing(true);
    setNotice(null);
    const res = await fetch("/api/settings/channels", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as {
      created?: boolean;
      accounts?: number;
      error?: { message?: string };
    } | null;
    setRepairing(false);
    if (!res?.ok) {
      setNotice({
        ok: false,
        text: data?.error?.message ?? "Couldn't register the webhook. Try again.",
      });
      return;
    }
    const cuentas = data?.accounts === 1 ? "your connected account" : `your ${data?.accounts} connected accounts`;
    setNotice({
      ok: true,
      text: data?.created
        ? `Webhook registered in Zernio, limited to ${cuentas}.`
        : `Webhook updated in Zernio and limited to ${cuentas}.`,
    });
    void refetch();
  }

  if (!rows) {
    return (
      <p className="text-sm text-muted-foreground">
        {failed ? "Couldn't load the channel status." : "Loading…"}
      </p>
    );
  }

  const porZernio = rows.filter((r) => r.source === "zernio");
  const webhookMal = porZernio.some((r) => r.health && r.health.webhook.level === "error");

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Turn channels on or off</CardTitle>
          <CardDescription>
            {"A channel that's off disappears from the menu and the inbox filters, and stops receiving messages. Its connection and conversations are kept: turning it back on picks up where it was. WhatsApp is always on."}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {switches.map((s) => (
            <div key={s.channel} data-switch={s.channel} className="flex items-center gap-3 px-6 py-3">
              <ChannelBadge channel={s.channel} className="h-6 w-6" />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold">{CHANNEL_LABEL[s.channel]}</div>
                {SWITCH_HINT[s.channel] && (
                  <div className="text-xs text-text-2">{SWITCH_HINT[s.channel]}</div>
                )}
              </div>
              <span className="text-xs font-semibold text-text-2">{s.on ? "On" : "Off"}</span>
              <Switch
                checked={s.on}
                label={`${CHANNEL_LABEL[s.channel]}: ${s.on ? "on" : "off"}`}
                disabled={!canManage || saving !== null}
                onCheckedChange={(next) => void toggle(s.channel, next)}
              />
            </div>
          ))}
          {!canManage && (
            <p className="px-6 py-3 text-sm text-text-2">Only the owner can turn channels on or off.</p>
          )}
          {switchError && (
            <p role="alert" className="px-6 py-3 text-sm text-destructive">{switchError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Channel status</CardTitle>
            <CardDescription>
              {"The channels turned on in this instance: whether they're connected, when the last customer message came in and, if they come through Zernio, how the account and webhook are doing."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refetch()}
            className="shrink-0"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.channel} data-channel={r.channel} className="space-y-2 px-6 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ChannelBadge channel={r.channel} className="h-6 w-6" />
                <span className="text-[14.5px] font-bold">{CHANNEL_LABEL[r.channel]}</span>
                <Estado row={r} />
                <Link
                  href={SETTINGS_HREF[r.channel]}
                  className="ml-auto text-xs font-semibold text-brand-text underline-offset-2 hover:underline"
                >
                  {r.connected ? "Configure" : "Connect"}
                </Link>
              </div>

              {r.connected && (
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[9.5rem_1fr]">
                  <dt className="text-text-2">Account</dt>
                  <dd>
                    {r.account ?? "Unnamed"}
                    {r.channel !== "whatsapp" && (
                      <span className="text-text-2">
                        {" "}
                        · {r.source === "zernio" ? "via Zernio" : r.source === "telegram" ? "Telegram Bot API" : r.source === "website" ? "website form" : "own Meta app"}
                      </span>
                    )}
                  </dd>

                  <dt className="text-text-2">Last message</dt>
                  <dd>
                    {r.lastInboundAt ? (
                      <>
                        {hace(r.lastInboundAt, now)}
                        <span className="text-text-2"> · {fecha(r.lastInboundAt)}</span>
                      </>
                    ) : (
                      <span className="text-text-2">Nothing has come in through this channel yet</span>
                    )}
                  </dd>

                  {r.health && (
                    <>
                      <dt className="text-text-2">Zernio account</dt>
                      <dd>
                        <Salud health={r.health.account} />
                      </dd>
                      <dt className="text-text-2">Zernio webhook</dt>
                      <dd>
                        <Salud health={r.health.webhook} />
                        {r.health.webhook.lastFiredAt && (
                          <span className="text-text-2">
                            {" "}
                            · last notice {hace(r.health.webhook.lastFiredAt, now)}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {porZernio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Zernio webhook</CardTitle>
            <CardDescription>
              {"It's the notice Zernio uses to deliver each message to this instance. Vocero registers it when connecting a channel, with the event"}{" "}
              <code>message.received</code> {"and limited to your connected accounts. If it was disabled or lost an account, it's repaired here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canManage ? (
              <Button
                variant={webhookMal ? "default" : "outline"}
                disabled={repairing}
                onClick={() => void repair()}
              >
                {repairing
                  ? "Talking to Zernio…"
                  : webhookMal
                    ? "Repair the webhook in Zernio"
                    : "Register the webhook again"}
              </Button>
            ) : (
              <p className="text-sm text-text-2">
                Only the owner can change the webhook.
              </p>
            )}
            {notice && (
              <p
                role="status"
                className={cn("text-sm", notice.ok ? "text-success-text" : "text-destructive")}
              >
                {notice.text}
              </p>
            )}
            {webhookUrl && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-text-2">
                  Create it manually in Zernio
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-text-2">
                    In Zernio → Webhooks, register this URL with the event{" "}
                    <code>message.received</code> and limit it to your accounts. Vocero reads the signing secret from Zernio: no need to copy it here.
                  </p>
                  <div className="flex gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copy the URL"
                      onClick={() => void copy(webhookUrl)}
                    >
                      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * El distintivo dice lo peor que le pasa al canal: «Conectado» en verde encima
 * de una cuenta que Zernio pide reconectar sería la pantalla mintiendo.
 */
function Estado({ row }: { row: Row }) {
  if (!row.connected) return <Badge variant="secondary">Not connected</Badge>;
  if (row.status === "reconnect_required") {
    return <Badge variant="destructive">Needs reconnecting</Badge>;
  }
  const niveles = row.health ? [row.health.account.level, row.health.webhook.level] : [];
  if (niveles.includes("error")) return <Badge variant="destructive">Having problems</Badge>;
  if (niveles.includes("warn")) return <Badge variant="warning">Review</Badge>;
  return <Badge variant="success">Connected</Badge>;
}

function Salud({ health }: { health: Health }) {
  return (
    <span className="inline-flex items-start gap-2">
      <span
        aria-hidden
        className={cn("mt-[0.45em] h-2 w-2 shrink-0 rounded-full", DOT[health.level])}
      />
      <span>{health.message}</span>
    </span>
  );
}
