"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ZernioConnect } from "@/components/settings/zernio-connect";

/**
 * 022 — Conexión del canal de TikTok.
 *
 * Una sola fuente: Zernio (TikTok no entrega mensajes a una app propia). Misma
 * forma que los demás canales: la llave se prueba contra la plataforma ANTES
 * de guardar, se cifra, y hacia fuera solo se enseña su cola. La pantalla solo
 * existe si el canal está encendido con `CHANNELS` (ADR-001).
 *
 * TikTok impone reglas que ningún otro canal tiene. Se dicen aquí, antes de
 * conectar, para que nadie las descubra con un mensaje rechazado.
 */

type Connection = {
  accountRef: string;
  username: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
  hasWebhookSecret: boolean;
};

const PASOS = [
  "The account is linked in the Zernio dashboard (Accounts → Connect), not from here.",
  "The API key is created in Zernio → Settings → API Keys and is shown only once (it starts with sk_).",
];

const REGLAS = [
  "The account must be TikTok Business, registered outside the European Union, Switzerland and the United Kingdom, with direct messages open.",
  "You can't start a conversation: only reply to whoever messaged you.",
  "After the customer's last message you can send up to 10 messages, for 48 hours. To continue, the customer has to write again.",
  "Each message is text, up to 6,000 characters. Images can't be sent from here yet.",
];

export function TiktokClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const c = await fetch("/api/settings/tiktok")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (c) setConnection(c.connection);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              The Zernio API key expired or was revoked.
            </p>
            <p className="text-danger-text opacity-80">
              TikTok sends are paused. Paste a new one below to reconnect.
            </p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Connected via Zernio
              {connection.username ? `: @${connection.username}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              Account {connection.accountRef} · key ending in ····
              {connection.tokenLast4}
              {connection.hasWebhookSecret ? " · webhook signature active" : ""}
            </p>
          </div>
          <Badge variant="success">TikTok active</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Before connecting: what TikTok requires</CardTitle>
          <CardDescription>
            {"These aren't limits of this CRM: TikTok sets them for direct messages on a business account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
            {REGLAS.map((regla, i) => (
              <li key={i}>{regla}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{connection ? "Reconnect TikTok" : "Connect TikTok"}</CardTitle>
          <CardDescription>
            {"Your account's direct messages arrive in the same inbox as WhatsApp, with their channel badge. They come through Zernio, with your own Zernio account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {PASOS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <ZernioConnect
            endpoint="/api/settings/tiktok"
            what="your TikTok account"
            idPrefix="tt"
            onSaved={() => void refetch()}
          />
        </CardContent>
      </Card>

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
    </div>
  );
}
