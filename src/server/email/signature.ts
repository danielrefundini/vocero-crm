import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma Svix que usa Resend en los webhooks de entrada.
 * El secreto empieza por `whsec_`; lo que sigue es la llave en base64.
 */
export function resendSignatureMatches(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowMs?: number;
  toleranceSec?: number;
}): boolean {
  const { secret, id, timestamp, signatureHeader, rawBody } = input;
  if (!id || !timestamp || !signatureHeader) return false;
  const tolerance = input.toleranceSec ?? 5 * 60;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > tolerance) return false;

  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyMaterial, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part));

  return candidates.some((candidate) => {
    const got = Buffer.from(candidate);
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
}
