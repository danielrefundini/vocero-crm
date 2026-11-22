import { apiError } from "@/lib/api";
import { normalizeUsPhone, smsIdentity } from "@/lib/exteriors";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { publicBase, twilioConfig } from "@/server/follow-up/config";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { applyStatusUpdate } from "@/server/inbox/status";
import { twilioSignatureMatches } from "@/server/sms/signature";

export const dynamic = "force-dynamic";

/**
 * Webhook de Twilio. Sin las variables de Twilio responde 404: el canal no
 * existe en esta instancia. La firma se comprueba contra APP_BASE_URL + la
 * ruta, que tiene que ser exactamente la URL configurada en Twilio.
 */
export async function POST(req: Request) {
  const config = twilioConfig();
  if (!config) return new Response(null, { status: 404 });

  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = `${publicBase()}${new URL(req.url).pathname}${new URL(req.url).search}`;
  if (!twilioSignatureMatches(config.authToken, url, params, req.headers.get("x-twilio-signature"))) {
    return apiError(403, "bad_signature", "Invalid Twilio signature");
  }

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "This CRM does not have an organization yet");

  const status = params.MessageStatus || params.SmsStatus || "";
  const body = params.Body ?? "";
  const sid = params.MessageSid || params.SmsSid || "";
  if (!sid) return apiError(422, "invalid", "Missing MessageSid");

  if (!body && status && status !== "received") {
    await applyStatusUpdate(organizationId, {
      id: sid,
      status: twilioToStatus(status),
      timestamp: String(Math.floor(Date.now() / 1000)),
    }).catch(() => {});
    return new Response(null, { status: 200 });
  }

  const from = normalizeUsPhone(params.From ?? "");
  if (!from) return apiError(422, "invalid_phone", "Missing From");

  await ingestInboundMessage({
    organizationId,
    identity: {
      identity: smsIdentity(from),
      channel: "sms",
      phone: from,
      waUserId: null,
      profileName: params.ProfileName?.trim() || null,
    },
    waMessageId: sid,
    type: "text",
    text: body,
    timestamp: String(Math.floor(Date.now() / 1000)),
  });

  return new Response(null, { status: 200 });
}

function twilioToStatus(status: string): "sent" | "delivered" | "read" | "failed" {
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "failed" || status === "undelivered") return "failed";
  return "sent";
}
