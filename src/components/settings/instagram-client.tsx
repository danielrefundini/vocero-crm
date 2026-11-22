"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

/**
 * 023 — Conexión del canal de Instagram: la pantalla que faltaba.
 *
 * `PUT /api/settings/instagram` y el webhook existen desde la 014, pero el
 * canal solo se podía conectar llamando a la API a mano. Gemela de la de
 * Messenger y con las mismas reglas: se prueba contra la plataforma ANTES de
 * guardar, el token se cifra, hacia fuera solo se enseña su cola, y la
 * pantalla solo existe si el canal está encendido con `CHANNELS` (ADR-001).
 */

type Source = "zernio" | "meta";

type Connection = {
  source: Source;
  igUserId: string;
  accountRef: string | null;
  username: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  instagramUrl: string | null;
  verifyToken: string;
  signatureLayer: boolean;
};

const HELP: Record<Source, { title: string; items: string[] }> = {
  zernio: {
    title: "Link your Instagram in Zernio and paste your API key here",
    items: [
      "The account is linked in the Zernio dashboard (Accounts → Connect), not from here. It must be a professional account: business or creator.",
      "The API key is created in Zernio → Settings → API Keys and is shown only once (it starts with sk_).",
    ],
  },
  meta: {
    title: "Create an app at developers.facebook.com with the Instagram product",
    items: [
      "The account must be in professional mode (Business or Creator).",
      "Generate the token with the instagram_business_basic and instagram_business_manage_messages permissions.",
      "Without App Review, the account only receives messages from profiles with a role in the app (admins, developers, testers).",
    ],
  },
};

export function InstagramClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<Source>("zernio");
  const [igUserId, setIgUserId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/instagram").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) {
      setConnection(c.connection);
      if (c.connection) {
        setSource(c.connection.source);
        if (c.connection.source === "meta") setIgUserId(c.connection.igUserId);
      }
    }
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function saveMeta() {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/settings/instagram", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "meta",
        igUserId: igUserId.trim(),
        token: token.trim(),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Couldn't connect the account");
      return;
    }
    const data = (await res.json()) as { username?: string | null };
    setToken("");
    setSaved(data.username ? `Account connected: @${data.username}` : "Connection saved");
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
  const canSaveMeta = token.trim().length > 0 && igUserId.trim().length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              {connection.source === "zernio"
                ? "The Zernio API key expired or was revoked."
                : "The token expired or was revoked."}
            </p>
            <p className="text-danger-text opacity-80">
              Instagram sends are paused. Reconnect below.
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
              {connection.username ? `: @${connection.username}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              {connection.source === "zernio"
                ? `Account ${connection.accountRef}`
                : `Account ${connection.igUserId}`}{" "}
              · {connection.source === "zernio" ? "key" : "token"} ending in ····
              {connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Instagram active</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {connection ? "Reconnect Instagram" : "Connect Instagram"}
          </CardTitle>
          <CardDescription>
            {"Your account's direct messages arrive in the same inbox as WhatsApp, with their channel badge."} {help.title}.
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
              endpoint="/api/settings/instagram"
              extraBody={{ source: "zernio" }}
              what="your Instagram account"
              idPrefix="ig"
              onSaved={() => void refetch()}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ig-user-id">Instagram account ID</Label>
                  <Input
                    id="ig-user-id"
                    value={igUserId}
                    onChange={(e) => setIgUserId(e.target.value)}
                    placeholder="17841400000000000"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ig-token">Access token</Label>
                  <Input
                    id="ig-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="IGAA…"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {saved && <p className="text-sm text-success-text">{saved} ✓</p>}

              <Button disabled={saving || !canSaveMeta} onClick={() => void saveMeta()}>
                {saving ? "Testing…" : "Test and save"}
              </Button>
            </>
          )}

          <p className="flex items-start gap-2 text-xs text-text-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {"Direct messages go into the inbox; comments on your posts don't. Instagram doesn't need a linked Facebook page: only Messenger requires that."}
          </p>
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
        webhook?.instagramUrl && (
          <Card>
            <CardHeader>
              <CardTitle>Instagram webhook</CardTitle>
              <CardDescription>
                In your Meta app: Instagram → Settings → Webhooks. Object{" "}
                <code>instagram</code>, field <code>messages</code>. Paste this URL and this verify token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Callback URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhook.instagramUrl} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy the URL"
                    onClick={() => void copy(webhook.instagramUrl!, "url")}
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
