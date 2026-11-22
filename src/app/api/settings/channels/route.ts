import { apiError, withAuth } from "@/lib/api";
import { channelsStatus } from "@/server/channels/status";
import {
  ZERNIO_CHANNELS,
  ensureWebhookForOrg,
} from "@/server/zernio/conexiones";
import { z } from "zod";
import { CHANNEL_ORDER, isChannel } from "@/lib/channels";
import {
  SWITCHABLE_CHANNELS,
  channelDisabledResponse,
  enabledChannels,
  saveEnabledChannels,
} from "@/server/channels/enabled";

export const dynamic = "force-dynamic";

/** Sin ningún canal social encendido no hay webhook que reparar (ADR-001). */
async function haySociales(): Promise<boolean> {
  const on = await enabledChannels();
  return ZERNIO_CHANNELS.some((c) => on.has(c)) || on.has("telegram");
}

/**
 * 023 — Estado de los canales: conexión, última entrada y, con Zernio, la
 * salud de la cuenta y del webhook. Ni la llave ni el secreto salen de aquí.
 */
export const GET = withAuth(async (session) => {
  const on = await enabledChannels();
  return Response.json({
    channels: await channelsStatus(session.organizationId),
    canManage: session.role === "owner",
    switches: SWITCHABLE_CHANNELS.map((channel) => ({ channel, on: on.has(channel) })),
  });
});

const switchesSchema = z.object({
  on: z.array(z.string()).max(CHANNEL_ORDER.length),
});

/** Turns channels on or off from Settings (owner only). WhatsApp stays on. */
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can turn channels on or off");
  }
  const parsed = switchesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid", "Send the list of channels to keep on");
  const wanted = parsed.data.on.filter(isChannel);
  const on = await saveEnabledChannels(wanted);
  return Response.json({
    switches: SWITCHABLE_CHANNELS.map((channel) => ({ channel, on: on.has(channel) })),
  });
});

/**
 * Da de alta o actualiza el webhook de esta instancia en Zernio, limitado a
 * las cuentas conectadas. Guardar una conexión ya lo hace; esto es para
 * reintentar si Zernio falló y para las instalaciones anteriores a la 1.6.
 */
export const POST = withAuth(async (session) => {
  if (!(await haySociales())) return channelDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Only the owner can change the webhook");
  }
  const r = await ensureWebhookForOrg(session.organizationId);
  if (!r.ok) {
    const status = r.code === "zernio_unavailable" ? 503 : r.code === "sin_conexiones" ? 409 : 422;
    return apiError(status, r.code, r.message);
  }
  return Response.json(r);
});
