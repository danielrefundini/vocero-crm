/**
 * SMS (Twilio) y correo (Resend) se configuran solo con variables de entorno.
 * Sin las tres de Twilio, o sin las de Resend, ese canal no envía ni recibe:
 * el resto del CRM arranca igual. Aquí no se registran los secretos.
 */

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type ResendConfig = {
  apiKey: string;
  fromEmail: string;
  webhookSecret: string;
};

function present(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function twilioConfig(
  env: Record<string, string | undefined> = process.env
): TwilioConfig | null {
  const accountSid = present(env.TWILIO_ACCOUNT_SID);
  const authToken = present(env.TWILIO_AUTH_TOKEN);
  const fromNumber = present(env.TWILIO_FROM_NUMBER);
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export function resendConfig(
  env: Record<string, string | undefined> = process.env
): ResendConfig | null {
  const apiKey = present(env.RESEND_API_KEY);
  const fromEmail = present(env.RESEND_FROM_EMAIL);
  const webhookSecret = present(env.RESEND_WEBHOOK_SECRET);
  if (!apiKey || !fromEmail || !webhookSecret) return null;
  return { apiKey, fromEmail, webhookSecret };
}

/** El envío no necesita el secreto del webhook; recibirlo sí. */
export function resendOutboundConfig(
  env: Record<string, string | undefined> = process.env
): { apiKey: string; fromEmail: string } | null {
  const apiKey = present(env.RESEND_API_KEY);
  const fromEmail = present(env.RESEND_FROM_EMAIL);
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail };
}

export function last4(value: string): string {
  const v = value.trim();
  return v.length <= 4 ? v : v.slice(-4);
}

export function publicBase(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_BASE_URL ?? "").replace(/\/$/, "");
}

export function smsWebhookUrl(env: Record<string, string | undefined> = process.env): string {
  const base = publicBase(env);
  return base ? `${base}/api/webhooks/sms/inbound` : "/api/webhooks/sms/inbound";
}

export function emailWebhookUrl(env: Record<string, string | undefined> = process.env): string {
  const base = publicBase(env);
  return base ? `${base}/api/webhooks/email/inbound` : "/api/webhooks/email/inbound";
}

export function websiteIntakeUrl(env: Record<string, string | undefined> = process.env): string {
  const base = publicBase(env);
  return base ? `${base}/api/intake/website` : "/api/intake/website";
}
