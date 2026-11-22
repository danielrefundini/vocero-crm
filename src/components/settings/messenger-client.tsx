"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Info } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { ZernioConnect } from "@/components/settings/zernio-connect";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * 017 — Conexión del canal de Messenger.
 *
 * Dos fuentes, como Instagram: la API unificada de Zernio o una app propia de
 * Meta. Misma forma que el wizard de WhatsApp: se prueba contra la plataforma
 * ANTES de guardar, el token se cifra y hacia fuera solo se enseña su cola. Y
 * la misma regla que los demás canales: la pantalla solo existe si el canal
 * está encendido con `CHANNELS` (ADR-001).
 */

type Source = "zernio" | "meta";

type Connection = {
  source: Source;
  pageId: string | null;
  pageName: string | null;
  accountRef: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  messengerUrl: string | null;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

const HELP: Record<Source, { title: string; items: string[] }> = {
  zernio: {
    title: "Link your page in Zernio and paste your API key here",
    items: [
      "The page is linked in the Zernio dashboard (Accounts → Connect), not from here.",
      "The API key is created in Zernio → Settings → API Keys and is shown only once (it starts with sk_).",
    ],
  },
  meta: {
    title: "Create an app at developers.facebook.com with the Messenger product",
    items: [
      "The page ID is in the page's «About» section, or in Messenger → Settings → Access tokens.",
      "Generate the page token there with the pages_messaging permission. A long-lived one avoids reconnecting every two months.",
      "Without App Review, the page only receives messages from accounts with a role in the app (admins, developers, testers).",
    ],
  },
};

export function MessengerClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<Source>("zernio");
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/messenger").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) {
      setConnection(c.connection);
      if (c.connection) {
        setSource(c.connection.source);
        if (c.connection.pageId) setPageId(c.connection.pageId);
      }
    }
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** Fuente Meta. Con Zernio guarda `ZernioConnect` (023). */
  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/settings/messenger", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "meta",
        pageId: pageId.trim() || null,
        token: token.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Couldn't connect the page");
      return;
    }
    const data = (await res.json()) as { pageName?: string | null };
    setToken("");
    setSaved(data.pageName ? `Page connected: ${data.pageName}` : "Connection saved");
    void refetch();
  }

  async function copy(text: string, what: "url" | "token") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // sin portapapeles (contexto no seguro): el texto sigue visible
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const help = HELP[source];
  const canSave = token.trim().length > 0 && pageId.trim().length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              The token expired or was revoked.
            </p>
            <p className="text-danger-text opacity-80">
              Messenger sends are paused. Paste a new one below to reconnect.
            </p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Connected via {connection.source === "zernio" ? "Zernio" : "Meta"}
              {connection.pageName ? `: ${connection.pageName}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              {connection.source === "zernio"
                ? `Account ${connection.accountRef}`
                : `Page ${connection.pageId}`}{" "}
              · token ending in ····{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Messenger active</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {connection ? "Reconnect Messenger" : "Connect Messenger"}
          </CardTitle>
          <CardDescription>
            Messages people send to your page arrive in the same inbox as WhatsApp, with their channel badge. {help.title}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Where do the messages come from?</Label>
            <div className="flex flex-wrap gap-2">
              {(["zernio", "meta"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  aria-pressed={source === s}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    source === s
                      ? "border-brand bg-brand-tint text-brand-text"
                      : "border-border-strong hover:bg-accent"
                  )}
                >
                  {s === "zernio" ? "Zernio (unified API)" : "Own Meta app"}
                </button>
              ))}
            </div>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {help.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          {source === "zernio" ? (
            <ZernioConnect
              endpoint="/api/settings/messenger"
              extraBody={{ source: "zernio" }}
              what="your Facebook page"
              idPrefix="fb"
              onSaved={() => void refetch()}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-page-id">Page ID</Label>
                  <Input
                    id="fb-page-id"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="1234567890"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-token">Page token</Label>
                  <Input
                    id="fb-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="EAAG…"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {saved && <p className="text-sm text-success-text">{saved} ✓</p>}

              <Button disabled={saving || !canSave} onClick={() => void save()}>
                {saving ? "Testing…" : "Test and save"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {source === "zernio" ? (
        <p className="flex items-start gap-2 text-xs text-text-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Vocero registers the webhook in your Zernio when connecting, limited to your accounts. If messages ever stop arriving, check{" "}
            <Link href="/settings/channels" className="font-semibold underline">
              the channel status
            </Link>
            .
          </span>
        </p>
      ) : (
        webhook?.messengerUrl && (
          <Card>
            <CardHeader>
              <CardTitle>Messenger webhook</CardTitle>
              <CardDescription>
                In your Meta app: Messenger → Settings → Webhooks. Object{" "}
                <code>page</code>, field <code>messages</code>. Paste this URL and this verify token, and subscribe the page to the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Callback URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhook.messengerUrl} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy the URL"
                    onClick={() => void copy(webhook.messengerUrl!, "url")}
                  >
                    {copied === "url" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Verify token</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhook.verifyToken} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy the verify token"
                    onClick={() => void copy(webhook.verifyToken, "token")}
                  >
                    {copied === "token" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="flex items-start gap-2 text-xs text-text-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {webhook.signatureLayer
                  ? "Each delivery is verified with your app's App Secret signature."
                  : "Set META_APP_SECRET on the instance so each delivery's signature is verified too."}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
