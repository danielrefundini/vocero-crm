"use client";

import { useEffect, useState } from "react";
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
import { CONNECTOR_META, type ConnectorId } from "@/lib/agenda-connectors";

/**
 * 015 — Las credenciales de un conector externo.
 *
 * Se guardan por su cuenta, no con el botón de la pantalla: primero se validan
 * CONTRA EL PROVEEDOR y solo entonces tocan la base. Unas credenciales que no
 * sirven no llegan a guardarse — el mismo trato que el wizard de WhatsApp.
 *
 * Hacia fuera nunca vuelve un secreto: solo sus últimos 4 y el estado.
 */

type ExternalConnector = Exclude<ConnectorId, "enlace-fijo">;

type Field = {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  help?: string;
};

const FIELDS: Record<ExternalConnector, Field[]> = {
  zoom: [
    { name: "accountId", label: "Account ID", placeholder: "abc123..." },
    { name: "clientId", label: "Client ID" },
    { name: "clientSecret", label: "Client Secret", secret: true },
  ],
  google: [
    { name: "clientId", label: "Client ID", placeholder: "…apps.googleusercontent.com" },
    { name: "clientSecret", label: "Client Secret", secret: true },
    {
      name: "refreshToken",
      label: "Refresh token",
      secret: true,
      help: "Obtained once by authorizing your own app.",
    },
    {
      name: "calendarId",
      label: "Calendar",
      placeholder: "primary",
      help: "Leave it as «primary» for your main calendar.",
    },
  ],
};

/** Lo que hay que saber ANTES de pegar nada. Son los tropiezos reales. */
const HELP: Record<ExternalConnector, { title: string; items: string[] }> = {
  zoom: {
    title: "Create a Server-to-Server OAuth app in the Zoom Marketplace",
    items: [
      "Copy the Account ID, Client ID and Client Secret from there.",
      "Give it four scopes: create, update and delete meeting, and read user (meeting:write, meeting:update, meeting:delete and user:read).",
      "Read user is the one the «Test» button uses: without it the connection fails even if the credentials are correct.",
    ],
  },
  google: {
    title: "Create a Google Cloud project with the Calendar API enabled",
    items: [
      "You need a Client ID, Client Secret and a refresh token with the calendar events scope (calendar.events).",
      "IMPORTANT: publish your OAuth app «in production». If you leave it in testing mode, Google revokes the permission after 7 days and appointments will stop creating their link without warning.",
    ],
  },
};

type Connection = {
  status: "connected" | "error";
  secretLast4: string | null;
  fields: Record<string, string>;
};

export function ConnectorCredentials({
  connector,
}: {
  connector: ExternalConnector;
}) {
  const meta = CONNECTOR_META[connector];
  const fields = FIELDS[connector];
  const help = HELP[connector];

  const [connection, setConnection] = useState<Connection | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setConnection(null);
    setValues({});
    setMessage(null);
    void (async () => {
      const res = await fetch(`/api/settings/${connector}`).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { connection: Connection | null };
      setConnection(data.connection);
      if (data.connection) setValues({ ...data.connection.fields });
    })();
  }, [connector]);

  async function submit(mode: "test" | "save") {
    setBusy(true);
    setMessage(null);
    const url =
      mode === "test"
        ? `/api/settings/${connector}/test`
        : `/api/settings/${connector}`;
    const res = await fetch(url, {
      method: mode === "test" ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMessage({
        kind: "error",
        text:
          data?.error?.message ??
          `Couldn't connect to ${meta.label}. Check the credentials.`,
      });
      return;
    }
    if (mode === "test") {
      setMessage({ kind: "ok", text: "Connection OK" });
      return;
    }
    const data = (await res.json()) as { connection: Connection };
    setConnection(data.connection);
    setMessage({ kind: "ok", text: `${meta.label} conectado` });
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`/api/settings/${connector}`, { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    setConnection(null);
    setValues({});
    setMessage(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect {meta.label}</CardTitle>
        <CardDescription>{help.title}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
          {help.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

        {connection?.status === "error" && (
          <p className="rounded-sm border border-danger-soft bg-danger-tint px-3 py-2 text-sm text-danger-text">
            {meta.label} rejected the latest credentials. Appointments are still booked, but without a link until you reconnect.
          </p>
        )}

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`${connector}-${f.name}`}>{f.label}</Label>
              <Input
                id={`${connector}-${f.name}`}
                type={f.secret ? "password" : "text"}
                value={values[f.name] ?? ""}
                placeholder={
                  f.secret && connection?.secretLast4
                    ? `•••• ${connection.secretLast4}`
                    : f.placeholder
                }
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
              />
              {f.help && <p className="text-xs text-text-3">{f.help}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => submit("test")} disabled={busy}>
            Test
          </Button>
          <Button onClick={() => submit("save")} disabled={busy}>
            {connection ? "Refresh" : "Connect"}
          </Button>
          {connection && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-sm text-text-3 hover:text-foreground"
            >
              Disconnect
            </button>
          )}
          {message && (
            <span
              className={
                message.kind === "ok"
                  ? "text-sm text-brand-text"
                  : "text-sm text-destructive"
              }
            >
              {message.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
