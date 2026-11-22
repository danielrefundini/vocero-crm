"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmbeddedSignup } from "./embedded-signup";
import { EntregasCard } from "./entregas-card";

type Connection = {
  wabaId: string;
  messagingAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  url: string;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

/** Lo que devuelve el registro del webhook en Meta (al guardar o a demanda). */
type WebhookRegistration =
  | { ok: true; appWithoutWebhook: boolean; messagingAccount?: MessagingAccountRegistration }
  | { ok: true; skipped: "waba_override"; host: string }
  | { ok: false; message: string };

/** 065 — El registro en la Cuenta de mensajes, aparte del del número. */
type MessagingAccountRegistration =
  | { ok: true; skipped?: "override_ajeno"; host?: string }
  | { ok: false; message: string };

/**
 * El último registro, y desde dónde se pidió. Uno solo para las dos tarjetas:
 * con uno por tarjeta, guardar con un token sin permiso dejaba el «registrado»
 * de un clic anterior al lado del aviso nuevo.
 */
type LastRegistration = {
  result: WebhookRegistration;
  from: "save" | "button" | "embedded";
};

export function WhatsappWizard() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [registration, setRegistration] = useState<LastRegistration | null>(
    null
  );

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/whatsapp").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) setConnection(c.connection);
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-[12rem] flex-1">
            <p className="font-medium text-danger-text">
              The WhatsApp token expired or was revoked.
            </p>
            <p className="text-danger-text opacity-80">
              Sends are paused. Paste a new token below and test the connection to reconnect.
            </p>
          </div>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      {connection && connection.status === "connected" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="min-w-[12rem] flex-1 text-sm">
            <p className="font-medium text-success-text">
              Connected number: {connection.displayPhoneNumber ?? connection.phoneNumberId}
            </p>
            <p className="text-success-text opacity-80">
              {connection.verifiedName ? `${connection.verifiedName} · ` : ""}
              token …{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Connected</Badge>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      {/* 066 — La conexión oficial con Meta. Sin la app configurada en la
          instancia no se dibuja y queda solo el alta manual de abajo. */}
      <EmbeddedSignup
        onConnected={(r) => {
          setRegistration({ result: r.webhook as WebhookRegistration, from: "embedded" });
          void refetch();
        }}
      />
      {registration?.from === "embedded" && (
        <RegistrationNotice registration={registration.result} afterSave />
      )}

      <ConnectForm
        // 066 — Se rehace si la conexión cambia por «Conectar con Meta»:
        // los campos toman los IDs nuevos.
        key={connection?.phoneNumberId ?? "sin-conexion"}
        existing={connection}
        registration={registration?.from === "save" ? registration.result : null}
        onRegistration={(result) =>
          setRegistration(result ? { result, from: "save" } : null)
        }
        onSaved={() => void refetch()}
      />

      {webhook && (
        <WebhookCard
          webhook={webhook}
          connection={connection}
          registration={registration?.from === "button" ? registration.result : null}
          onRegistration={(result) =>
            setRegistration(result ? { result, from: "button" } : null)
          }
        />
      )}

      {/* 047 — Lo que llegó y no pudo entrar a la bandeja. */}
      {connection && <EntregasCard />}
    </div>
  );
}

/**
 * Soltar el número.
 *
 * Pide confirmación porque corta la entrada y la salida de mensajes al
 * instante — no es un ajuste, es apagar el canal. Lo que NO hace es borrar la
 * bandeja, y el aviso lo dice: sin eso, nadie se atreve a tocarlo.
 */
function Desconectar({ onHecho }: { onHecho: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function desconectar() {
    setYendo(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/whatsapp", { method: "DELETE" });
      if (res.ok) {
        setConfirmando(false);
        onHecho();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "Couldn't disconnect the number.");
      }
    } catch {
      setError("No connection to the server.");
    } finally {
      setYendo(false);
    }
  }

  if (!confirmando) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>
        Disconnect
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {"You'll stop receiving and sending. Your conversations stay."}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={yendo}
        onClick={() => setConfirmando(false)}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={yendo}
        onClick={() => void desconectar()}
      >
        {yendo ? "Disconnecting…" : "Yes, disconnect"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

function ConnectForm({
  existing,
  registration,
  onRegistration,
  onSaved,
}: {
  existing: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
  onSaved: () => void;
}) {
  const [wabaId, setWabaId] = useState(existing?.wabaId ?? "");
  const [messagingAccountId, setMessagingAccountId] = useState(
    existing?.messagingAccountId ?? ""
  );
  const [phoneNumberId, setPhoneNumberId] = useState(
    existing?.phoneNumberId ?? ""
  );
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<
    | { ok: true; display: string }
    | { ok: false; message: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = wabaId.trim() && phoneNumberId.trim() && token.trim();

  async function test() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/whatsapp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumberId, token }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: "No connection to the server" });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      displayPhoneNumber?: string;
      error?: { message?: string };
    } | null;
    if (res.ok && data?.displayPhoneNumber) {
      setTestResult({ ok: true, display: data.displayPhoneNumber });
    } else {
      setTestResult({
        ok: false,
        message: data?.error?.message ?? "Validation failed",
      });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    onRegistration(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wabaId,
        phoneNumberId,
        token,
        // 065 — Vacía con una guardada = quitarla; vacía sin guardada = que
        // el servidor intente descubrirla.
        ...(messagingAccountId.trim() || existing?.messagingAccountId
          ? { messagingAccountId: messagingAccountId.trim() }
          : {}),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "Couldn't save the connection");
      return;
    }
    const saved = (await res.json().catch(() => null)) as {
      webhook?: WebhookRegistration;
    } | null;
    onRegistration(saved?.webhook ?? null);
    setToken("");
    setTestResult(null);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {existing ? "Reconnect / update the number" : "Connect your WhatsApp number"}
        </CardTitle>
        <CardDescription>
          {"Paste your WhatsApp Cloud API credentials. The token is validated against Meta BEFORE it's saved and is stored encrypted. When you save, the webhook is registered in Meta for you."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border bg-background p-4 text-sm">
          <p className="font-medium">Where does the token come from?</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">Direct mode</p>
              <p className="text-muted-foreground">
                The business has its own app at{" "}
                <span className="text-foreground">developers.facebook.com</span>: use a <span className="text-foreground">system user</span>{" "}
                {"token (doesn't expire) with WhatsApp permissions. In this mode it's best to also set the App Secret for the webhook signature."}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">Agency mode (Tech Provider)</p>
              <p className="text-muted-foreground">
                {"Your agency runs Embedded Signup on ITS platform and its backend gets the client's token; it hands it to you to paste here. When you save, the webhook is registered on the number ("}<span className="text-foreground">number override</span>{"), same as in direct mode; if your agency already routes the account to its own backend, that's respected."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="waba-id">WABA ID</Label>
            <Input
              id="waba-id"
              placeholder="WhatsApp Business account ID"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone-number-id">Phone Number ID</Label>
            <Input
              id="phone-number-id"
              placeholder="Phone number ID"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="messaging-account-id">
            Messaging account ID{" "}
            <span className="font-normal text-muted-foreground">(recommended)</span>
          </Label>
          <Input
            id="messaging-account-id"
            inputMode="numeric"
            placeholder="Business Settings › Accounts › Messaging accounts"
            value={messagingAccountId}
            onChange={(e) => setMessagingAccountId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Since 2026 Meta separates the WhatsApp account (the number) from the Messaging account (templates and billing). With it, templates are created where Meta accepts them and the webhook is registered on both. If you leave it empty, we try to find it.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">Access token</Label>
          <Input
            id="token"
            type="password"
            placeholder={existing ? `Saved (…${existing.tokenLast4}) — paste a new one to change it` : "EAAG…"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTestResult(null);
            }}
          />
        </div>

        {testResult && (
          <p
            className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}
          >
            {testResult.ok
              ? `✓ Valid token for ${testResult.display}. You can save now.`
              : testResult.message}
          </p>
        )}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {registration && (
          <RegistrationNotice registration={registration} afterSave />
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!canTest || testing}
            onClick={() => void test()}
          >
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button
            disabled={!testResult?.ok || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save connection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * El resultado de registrar el webhook en Meta, en palabras de quien lo lee.
 *
 * Un fallo aquí NO deshace el guardado: el token es válido y la conexión
 * envía. Por eso el aviso es de advertencia, no de error, y dice qué hacer.
 */
function RegistrationNotice({
  registration,
  afterSave = false,
}: {
  registration: WebhookRegistration;
  afterSave?: boolean;
}) {
  if (registration.ok && "messagingAccount" in registration && registration.messagingAccount) {
    const { messagingAccount, ...delNumero } = registration;
    return (
      <div className="space-y-2">
        <RegistrationNotice registration={delNumero} afterSave={afterSave} />
        <MessagingAccountNotice result={messagingAccount} />
      </div>
    );
  }
  if (registration.ok && "skipped" in registration) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Your WhatsApp account already routes its webhooks to{" "}
          <span className="text-foreground">{registration.host}</span> {"(an external brain or your agency's backend). That's respected: the number has no webhook of its own and messages keep arriving there."}
        </span>
      </p>
    );
  }
  if (registration.ok && !registration.appWithoutWebhook) {
    return (
      <p className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        {"Webhook registered in Meta: this number's messages arrive here. No need to paste anything in your app's dashboard."}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {registration.ok ? (
          <>
            {"Webhook registered on the number, but Meta reports no webhook on your app. If messages don't arrive: in developers.facebook.com → your app → WhatsApp → Configuration, verify a callback URL (the one below works) and subscribe the field"}{" "}
            <code>messages</code>{". It's once per app."}
          </>
        ) : (
          <>
            {afterSave ? "The connection was saved, but we couldn't" : "We couldn't"} register the webhook in Meta. {registration.message} Retry with «Register in Meta» or paste the URL and verify token manually.
          </>
        )}
      </span>
    </p>
  );
}

/** 065 — Cómo quedó el webhook en la Cuenta de mensajes del split de 2026. */
function MessagingAccountNotice({ result }: { result: MessagingAccountRegistration }) {
  if (result.ok && result.skipped) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Your Messaging account already routes its webhooks to{" "}
          <span className="text-foreground">{result.host}</span>{". That's respected."}
        </span>
      </p>
    );
  }
  if (result.ok) {
    return (
      <p className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        Webhook also registered on the Messaging account.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {result.message} Without this, on Meta accounts that are already separated, incoming messages may not arrive.
      </span>
    </p>
  );
}

function WebhookCard({
  webhook,
  connection,
  registration,
  onRegistration,
}: {
  webhook: WebhookInfo;
  connection: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const canRegister = connection?.status === "connected";

  async function register(recuperar = false) {
    if (recuperar) {
      const host = registration?.ok && "skipped" in registration ? registration.host : "another service";
      const ok = window.confirm(
        `Recover the webhook: your number's messages will stop arriving at ${host} and will arrive at this CRM, which dispatches them to your agent. Continue?`
      );
      if (!ok) return;
    }
    setRegistering(true);
    onRegistration(null);
    const res = await fetch("/api/settings/webhook", {
      method: "POST",
      ...(recuperar
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ recuperar: true }) }
        : {}),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | (WebhookRegistration & { error?: { message?: string } })
      | null;
    setRegistering(false);
    if (res?.ok && data?.ok) {
      onRegistration(data);
    } else {
      onRegistration({
        ok: false,
        message: data?.error?.message ?? "No connection to the server.",
      });
    }
  }

  function copy(text: string, which: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp webhook</CardTitle>
        <CardDescription>
          {"When you save the connection, this address is registered in Meta for you, on the number (override). These values are for your agency's backend, or to paste manually in the Meta dashboard only if automatic registration fails."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canRegister && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={registering}
              onClick={() => void register(false)}
            >
              {registering ? "Registering…" : "Register in Meta"}
            </Button>
            {registration && <RegistrationNotice registration={registration} />}
            {/* 035 — Quien venía con Nea 1.x delante del CRM: el webhook vive en
                un override ajeno de la WABA y el registro normal lo respeta. */}
            {registration?.ok && "skipped" in registration && (
              <Button
                variant="outline"
                size="sm"
                disabled={registering}
                onClick={() => void register(true)}
              >
                Recover the webhook
              </Button>
            )}
          </div>
        )}
        {!webhook.isHttps && (
          <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {"The configured URL isn't https: Meta requires https for webhooks. Set APP_BASE_URL to your public domain."}
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Webhook URL (callback URL)</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.url}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy URL"
              onClick={() => copy(webhook.url, "url")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "url" && (
              <span className="text-xs text-primary">Copied ✓</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The URL contains the secret token in its path: treat it like a password.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Verify token</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.verifyToken}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy verify token"
              onClick={() => copy(webhook.verifyToken, "vt")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "vt" && (
              <span className="text-xs text-primary">Copied ✓</span>
            )}
          </div>
        </div>
        {webhook.signatureLayer ? (
          <p className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" /> Signature verification active (META_APP_SECRET configured): each event is validated with x-hub-signature-256.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> No App Secret configured: the webhook is protected by the secret URL (normal in agency mode). For the extra signature layer, add META_APP_SECRET to the instance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
