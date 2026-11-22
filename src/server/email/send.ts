import { resendOutboundConfig } from "@/server/follow-up/config";

export class ResendError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ResendError";
    this.status = status;
  }
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  apiKey?: string;
  fromEmail?: string;
}): Promise<string> {
  const cfg = resendOutboundConfig();
  const apiKey = input.apiKey ?? cfg?.apiKey;
  const fromEmail = input.fromEmail ?? cfg?.fromEmail;
  if (!apiKey || !fromEmail) throw new ResendError("Email is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  const payload = (await res.json().catch(() => null)) as {
    id?: string;
    message?: string;
  } | null;
  if (!res.ok || !payload?.id) {
    throw new ResendError(payload?.message || `Resend rejected the email (${res.status})`, res.status);
  }
  return payload.id;
}

/** El webhook de entrada de Resend no trae el cuerpo: se pide aparte. */
export async function fetchReceivedEmail(
  emailId: string,
  apiKey: string
): Promise<{ text: string | null; html: string | null; subject: string | null }> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new ResendError(`Could not read the inbound email (${res.status})`, res.status);
  }
  const payload = (await res.json().catch(() => null)) as {
    text?: string | null;
    html?: string | null;
    subject?: string | null;
  } | null;
  return {
    text: payload?.text ?? null,
    html: payload?.html ?? null,
    subject: payload?.subject ?? null,
  };
}
