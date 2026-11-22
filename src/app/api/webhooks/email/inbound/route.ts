import { apiError } from "@/lib/api";
import { emailIdentity, normalizeEmail } from "@/lib/exteriors";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { fetchReceivedEmail } from "@/server/email/send";
import { resendSignatureMatches } from "@/server/email/signature";
import { resendConfig } from "@/server/follow-up/config";
import { ingestInboundMessage } from "@/server/inbox/ingest";

export const dynamic = "force-dynamic";

type Received = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    subject?: string;
    text?: string | null;
    html?: string | null;
  };
};

/**
 * Webhook de entrada de Resend (`email.received`), firmado con Svix.
 * Sin RESEND_API_KEY, RESEND_FROM_EMAIL y RESEND_WEBHOOK_SECRET responde 404.
 */
export async function POST(req: Request) {
  const config = resendConfig();
  if (!config) return new Response(null, { status: 404 });

  const raw = await req.text();
  const ok = resendSignatureMatches({
    secret: config.webhookSecret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signatureHeader: req.headers.get("svix-signature"),
    rawBody: raw,
  });
  if (!ok) return apiError(403, "bad_signature", "Invalid Resend signature");

  let payload: Received;
  try {
    payload = JSON.parse(raw) as Received;
  } catch {
    return apiError(422, "invalid_json", "Body must be JSON");
  }
  if (payload.type && payload.type !== "email.received") {
    return new Response(null, { status: 200 });
  }
  const emailId = payload.data?.email_id?.trim();
  const from = parseFrom(payload.data?.from ?? "");
  if (!emailId || !from) return apiError(422, "invalid", "Missing email id or sender");

  let text = payload.data?.text?.trim() || "";
  let subject = payload.data?.subject?.trim() || "";
  if (!text) {
    try {
      const fetched = await fetchReceivedEmail(emailId, config.apiKey);
      text = fetched.text?.trim() || stripHtml(fetched.html) || "";
      subject = subject || fetched.subject?.trim() || "";
    } catch (err) {
      console.warn(
        "[email] could not read the inbound body:",
        err instanceof Error ? err.message : "error"
      );
      return apiError(502, "body_unavailable", "The email body could not be read yet");
    }
  }

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "This CRM does not have an organization yet");

  const body = subject ? `Subject: ${subject}\n\n${text}` : text;
  await ingestInboundMessage({
    organizationId,
    identity: {
      identity: emailIdentity(from.email),
      channel: "email",
      phone: null,
      waUserId: null,
      profileName: from.name,
    },
    waMessageId: `resend:${emailId}`,
    type: "text",
    text: body || "(empty email)",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  return new Response(null, { status: 200 });
}

function parseFrom(raw: string): { email: string; name: string | null } | null {
  const angle = raw.match(/^(.*)<([^>]+)>$/);
  const email = normalizeEmail(angle?.[2] ?? raw);
  if (!email) return null;
  const name = angle?.[1]?.replace(/["]/g, "").trim() || null;
  return { email, name };
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
