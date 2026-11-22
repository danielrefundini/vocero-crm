"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
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

/**
 * Connection of the Telegram channel: a bot created with @BotFather. The
 * token is checked against Telegram before saving, stored encrypted, and only
 * its last 4 characters are ever shown. The page only exists when the channel
 * is on in `CHANNELS`.
 */

type Connection = {
  botId: string;
  botUsername: string | null;
  botName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type Aviso = { tipo: "ok" | "warn" | "error"; texto: string } | null;

const PASOS = [
  "In Telegram, open @BotFather and send /newbot (or /mybots to reuse a bot you already have).",
  "Choose a name and a username ending in “bot”.",
  "BotFather replies with a token like 123456789:AAH…. Paste it below.",
];

const REGLAS = [
  "A bot can't start a conversation: the customer has to message it first (for example from a t.me/your_bot link).",
  "Once they've written, you can reply at any time. There's no 24-hour window.",
  "Only private chats with the bot reach the inbox; groups are ignored.",
  "Each message is text, up to 4,096 characters. Images can't be sent from here yet.",
];

export function TelegramClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  const refetch = useCallback(async () => {
    const c = await fetch("/api/settings/telegram")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (c) {
      setConnection(c.connection);
      setCanManage(Boolean(c.canManage));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const conectar = async () => {
    setSaving(true);
    setAviso(null);
    const res = await fetch("/api/settings/telegram", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!res?.ok) {
      setAviso({ tipo: "error", texto: data?.error?.message ?? data?.message ?? "Couldn't connect the bot." });
      return;
    }
    setToken("");
    setAviso(
      data.webhook?.ok
        ? { tipo: "ok", texto: "Bot connected. Messages sent to it will appear in the inbox." }
        : { tipo: "warn", texto: data.webhook?.message ?? "Bot saved, but the webhook isn't registered yet." }
    );
    void refetch();
  };

  const desconectar = async () => {
    if (!window.confirm("Disconnect this bot? Telegram will stop delivering its messages here.")) return;
    setSaving(true);
    await fetch("/api/settings/telegram", { method: "DELETE" }).catch(() => null);
    setSaving(false);
    setAviso(null);
    void refetch();
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const avisoClase = {
    ok: "border-success-soft bg-success-tint text-success-text",
    warn: "border-warning-soft bg-warning-tint text-warning-text",
    error: "border-danger-soft bg-danger-tint text-danger-text",
  };

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">The bot token was revoked.</p>
            <p className="text-danger-text opacity-80">
              Telegram sends are paused. Paste the bot&apos;s current token below to reconnect.
            </p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Connected: {connection.botName ?? "your bot"}
              {connection.botUsername ? ` (@${connection.botUsername})` : ""}
            </p>
            <p className="text-success-text opacity-80">
              Bot {connection.botId} · token ending in ····{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Telegram active</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How Telegram bots work</CardTitle>
          <CardDescription>
            {"These are Telegram's rules for bots, not limits of this CRM."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
            {REGLAS.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{connection ? "Change or reconnect the bot" : "Connect a Telegram bot"}</CardTitle>
          <CardDescription>
            {"Messages to your bot arrive in the same inbox as WhatsApp, with a Telegram badge. It uses Telegram's official Bot API directly, with no third-party service."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-text-2">
            {PASOS.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>

          {canManage ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void conectar();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="tg-token">Bot token</Label>
                <Input
                  id="tg-token"
                  type="password"
                  autoComplete="off"
                  placeholder="123456789:AAH…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving || token.trim().length === 0}>
                  {saving ? "Checking…" : "Test and connect"}
                </Button>
                {connection && (
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void desconectar()}>
                    Disconnect
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-text-2">Only the workspace owner can connect or change the bot.</p>
          )}

          {aviso && (
            <p className={`rounded-lg border p-3 text-sm ${avisoClase[aviso.tipo]}`} role="status">
              {aviso.texto}
            </p>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-text-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Telegram only delivers to a public HTTPS address. While this CRM runs on localhost the bot connects,
          but incoming messages won&apos;t arrive until APP_BASE_URL points to a public address and you save the token again.
        </span>
      </p>
    </div>
  );
}
