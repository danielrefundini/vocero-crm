import { toE164 } from "@/lib/exteriors";
import { twilioConfig, type TwilioConfig } from "@/server/follow-up/config";

export class TwilioError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "TwilioError";
    this.status = status;
  }
}

/** Envío de un SMS. El sid de Twilio es el id con el que se deduplica. */
export async function sendTwilioSms(
  to: string,
  body: string,
  config: TwilioConfig = twilioConfig() ?? failMissing()
): Promise<string> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const form = new URLSearchParams({
    To: toE164(to),
    From: config.fromNumber.startsWith("+") ? config.fromNumber : toE164(config.fromNumber.replace(/\D/g, "")),
    Body: body,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const payload = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!res.ok || !payload?.sid) {
    throw new TwilioError(payload?.message || `Twilio rejected the SMS (${res.status})`, res.status);
  }
  return payload.sid;
}

function failMissing(): never {
  throw new TwilioError("SMS is not configured");
}
