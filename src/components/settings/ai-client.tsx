"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  AI_PROVIDERS,
  AI_PROVIDER_PRESETS,
  AI_STATUS_LABEL,
  presetDeBaseUrl,
  type AiProviderId,
  type AiStatus,
} from "@/lib/ai/presets";

/**
 * Ajustes → IA: con qué piensa el agente (issue #85).
 *
 * La llave se manda una vez y no vuelve: la pantalla solo muestra sus últimos
 * 4 y el estado. Si está pausada, dice POR QUÉ y qué hacer — no es lo mismo
 * «tu llave dejó de servir» que «tu cuenta se quedó sin saldo», y son dos
 * acciones distintas del dueño. «Probar conexión» y «Traer modelos» hablan
 * con el proveedor usando lo escrito, sin guardar nada.
 */

type Credencial = {
  proveedor: AiProviderId;
  baseUrl: string;
  modelo: string;
  tokenLast4: string;
  estado: AiStatus;
  motivo: string | null;
  desde: string | null;
  actualizado: string;
};

type Vista = {
  credencial: Credencial | null;
  activa: boolean;
  origen: "org" | "env" | null;
  mensaje: string | null;
  respaldoEntorno: { baseUrl: string; modelo: string; tokenLast4: string } | null;
};

type Modelo = { id: string; nombre: string | null };

type Mensaje = { kind: "ok" | "error" | "info"; text: string };

type Ocupado = "guardar" | "probar" | "modelos" | "quitar" | null;

const BADGE_DE_ESTADO: Record<AiStatus, "success" | "warning" | "destructive"> = {
  active: "success",
  paused_no_credit: "warning",
  paused_invalid_token: "destructive",
};

export function AiClient() {
  const [vista, setVista] = useState<Vista | null>(null);
  const [provider, setProvider] = useState<AiProviderId>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [modelos, setModelos] = useState<Modelo[] | null>(null);

  const cargar = useCallback(async (): Promise<Vista | null> => {
    const res = await fetch("/api/settings/ai").catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json()) as Vista;
    setVista(data);
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      const data = await cargar();
      if (!data) return;
      // El formulario arranca con lo guardado; si no hay nada, con el respaldo
      // del entorno (para que «Guardar» lo deje escrito tal cual se usa hoy).
      const base = data.credencial
        ? {
            provider: data.credencial.proveedor,
            baseUrl: data.credencial.baseUrl,
            modelo: data.credencial.modelo,
          }
        : data.respaldoEntorno
          ? {
              provider: presetDeBaseUrl(data.respaldoEntorno.baseUrl),
              baseUrl: data.respaldoEntorno.baseUrl,
              modelo: data.respaldoEntorno.modelo,
            }
          : null;
      if (base) {
        setProvider(base.provider);
        setBaseUrl(base.provider === "openai_compatible" ? base.baseUrl : "");
        setModel(base.modelo);
      }
    })();
  }, [cargar]);

  const preset = AI_PROVIDER_PRESETS[provider];
  const cred = vista?.credencial ?? null;

  /** Lo que viaja en cada llamada: el token solo si se escribió. */
  function cuerpo(conModelo: boolean) {
    return JSON.stringify({
      provider,
      ...(provider === "openai_compatible" ? { baseUrl: baseUrl.trim() } : {}),
      ...(conModelo ? { model: model.trim() } : {}),
      ...(token.trim() ? { token: token.trim() } : {}),
    });
  }

  async function leerError(res: Response | null, porDefecto: string) {
    const data = (await res?.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return data?.error?.message ?? porDefecto;
  }

  const faltaBase = provider === "openai_compatible" && !baseUrl.trim();
  const faltaLlave = !token.trim() && !cred;
  const puedeProbar = !faltaBase && !faltaLlave && model.trim().length > 0;

  async function probar() {
    setOcupado("probar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo(true),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, "Couldn't test the connection"),
      });
      return;
    }
    const data = (await res.json()) as {
      latencyMs: number;
      reactivada: boolean;
      vista: Vista | null;
    };
    if (data.vista) setVista(data.vista);
    setMensaje({
      kind: "ok",
      text: data.reactivada
        ? `Connection OK (${data.latencyMs} ms). Your key is active again.`
        : `Connection OK (${data.latencyMs} ms)${token.trim() ? ". Press Save to keep it configured." : "."}`,
    });
  }

  async function traerModelos() {
    setOcupado("modelos");
    setMensaje(null);
    const res = await fetch("/api/settings/ai/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cuerpo(false),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, "Couldn't fetch the model list"),
      });
      return;
    }
    const data = (await res.json()) as {
      soportado: boolean;
      modelos: Modelo[];
      mensaje?: string;
    };
    if (!data.soportado) {
      setModelos(null);
      setMensaje({
        kind: "info",
        text: data.mensaje ?? "This provider doesn't publish its model list.",
      });
      return;
    }
    setModelos(data.modelos);
    setMensaje({
      kind: "info",
      text: `${data.modelos.length} models available: type in the Model field to filter.`,
    });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado("guardar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: cuerpo(true),
    }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({
        kind: "error",
        text: await leerError(res, "Couldn't save. Check the details and try again."),
      });
      return;
    }
    setVista((await res.json()) as Vista);
    // La llave se borra del formulario en cuanto viaja: no tiene por qué
    // seguir en pantalla ni en la memoria de la pestaña.
    setToken("");
    setMensaje({
      kind: "ok",
      text: "Saved. Test the connection and run the Lab before turning the agent on with real customers.",
    });
  }

  async function quitar() {
    setOcupado("quitar");
    setMensaje(null);
    const res = await fetch("/api/settings/ai", { method: "DELETE" }).catch(
      () => null
    );
    setOcupado(null);
    if (!res?.ok) {
      setMensaje({ kind: "error", text: "Couldn't remove the key." });
      return;
    }
    const data = (await res.json()) as Vista;
    setVista(data);
    setToken("");
    setMensaje({
      kind: "info",
      text: data.respaldoEntorno
        ? "Key deleted. The agent keeps using the instance's environment variables."
        : "Key deleted. Your agent can't answer until you set up another one.",
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>
            Your agent (through the CRM: no need to copy it to your agent) and the Lab judge think with this key. Here you pick the provider, the model and the key that pays for usage. The key is stored encrypted and is never shown in full again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {vista === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : cred ? (
            <EstadoGuardado cred={cred} vista={vista} />
          ) : vista.respaldoEntorno ? (
            <div className="rounded-md border p-3 text-sm">
              <p>
                {"Today the agent uses the instance's environment variables:"}{" "}
                <code className="font-mono">{vista.respaldoEntorno.modelo || "no model"}</code>{" "}
                with the key{" "}
                <code className="font-mono">••••{vista.respaldoEntorno.tokenLast4}</code>.
              </p>
              <p className="mt-1 text-muted-foreground">
                What you save here overrides them, no restart needed.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No AI provider yet: your agent has nothing to think with, and messages arrive in the inbox for a person to handle.
            </p>
          )}

          <AyudaLlave provider={provider} />

          <form onSubmit={guardar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">Provider</Label>
              <select
                id="ai-provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as AiProviderId);
                  setModelos(null);
                }}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {AI_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {AI_PROVIDER_PRESETS[id].label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {preset.baseUrl
                  ? `Talks to ${preset.baseUrl}. A single key gives access to models from every lab.`
                  : "Any API shaped like OpenAI's: OpenAI, Groq, Together, your own server…"}
              </p>
            </div>

            {provider === "openai_compatible" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">Base URL</Label>
                <Input
                  id="ai-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  With or without <code className="font-mono">/v1</code> {"at the end: it's added automatically."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Model</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-model"
                  list={modelos ? "ai-modelos" : undefined}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={preset.modelPlaceholder}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={traerModelos}
                  disabled={ocupado !== null || faltaBase || faltaLlave}
                >
                  {ocupado === "modelos" ? "Fetching…" : "Fetch models"}
                </Button>
              </div>
              {modelos && (
                <datalist id="ai-modelos">
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre ?? undefined}
                    </option>
                  ))}
                </datalist>
              )}
              <p className="text-xs text-muted-foreground">
                Your agent uses it through the CRM to chat with your customers, and the Lab judge uses it to grade.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-token">
                {cred ? "Replace the key" : "Provider key"}
              </Label>
              <Input
                id="ai-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  cred ? `•••• ${cred.tokenLast4} (leave it empty to keep it)` : preset.tokenPlaceholder
                }
              />
              <p className="text-xs text-muted-foreground">
                {"It's stored encrypted on your server. Don't share it over chat."}
              </p>
            </div>

            {mensaje && (
              <p
                role={mensaje.kind === "error" ? "alert" : "status"}
                className={
                  mensaje.kind === "error"
                    ? "text-sm text-danger-text"
                    : mensaje.kind === "ok"
                      ? "text-sm text-success-text"
                      : "text-sm text-muted-foreground"
                }
              >
                {mensaje.text}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={probar}
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "probar" ? "Testing…" : "Test connection"}
              </Button>
              <Button
                type="submit"
                disabled={ocupado !== null || !puedeProbar}
              >
                {ocupado === "guardar" ? "Saving…" : "Save"}
              </Button>
              {cred && (
                <button
                  type="button"
                  onClick={quitar}
                  disabled={ocupado !== null}
                  className="text-sm text-text-3 hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EstadoGuardado({ cred, vista }: { cred: Credencial; vista: Vista }) {
  return (
    <div className="rounded-md border p-3 text-sm" data-ai-estado={cred.estado}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Key connected: <code className="font-mono">••••{cred.tokenLast4}</code>
          {" · "}
          {AI_PROVIDER_PRESETS[cred.proveedor].label}
          {" · "}
          <code className="font-mono">{cred.modelo}</code>
        </span>
        <Badge variant={BADGE_DE_ESTADO[cred.estado]}>
          {AI_STATUS_LABEL[cred.estado]}
        </Badge>
      </div>
      {cred.proveedor === "openai_compatible" && (
        <p className="mt-1 text-xs text-muted-foreground">{cred.baseUrl}</p>
      )}
      {vista.mensaje && (
        <p className="mt-2 text-muted-foreground">{vista.mensaje}</p>
      )}
      {cred.motivo && (
        <p className="mt-1 text-xs text-muted-foreground">
          The provider said: {cred.motivo}
        </p>
      )}
    </div>
  );
}

/** Lo que hay que saber ANTES de pegar nada. Plegado: no estorba al que ya lo sabe. */
function AyudaLlave({ provider }: { provider: AiProviderId }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">How do I get my key?</summary>
      {provider === "openrouter" ? (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Create a business account at{" "}
            <a className="underline" href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">
              openrouter.ai
            </a>
            .
          </li>
          <li>
            In{" "}
            <a className="underline" href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener noreferrer">
              Credits
            </a>
            , add credit. Usage is billed to that account.
          </li>
          <li>
            Open{" "}
            <a className="underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">
              Keys
            </a>{" "}
            → Create key and copy the key.
          </li>
          <li>Paste it here, press «Test connection» and then «Save».</li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>{"In your provider's dashboard, create an API key with permission for chat completions."}</li>
          <li>Copy its base URL (the root of the API, e.g. <code className="font-mono">https://api.openai.com</code>).</li>
          <li>Paste the base URL, the model and the key here; «Test connection» confirms everything fits.</li>
        </ol>
      )}
      <p className="mt-3 text-muted-foreground">
        If you prefer to keep it in the instance environment (
        <code className="font-mono">OPENROUTER_API_TOKEN</code> and{" "}
        <code className="font-mono">OPENROUTER_MODEL</code>), it keeps working as a fallback while nothing is saved here.
      </p>
    </details>
  );
}
