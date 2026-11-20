import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de Twilio (X-Twilio-Signature): HMAC-SHA1 en base64 de la URL pública
 * más los parámetros del POST ordenados por nombre.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
): string {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key] ?? ""}`)
      .join("");
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function twilioSignatureMatches(
  authToken: string,
  url: string,
  params: Record<string, string>,
  header: string | null
): boolean {
  if (!header) return false;
  const expected = twilioSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
