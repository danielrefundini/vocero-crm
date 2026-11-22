import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { channelDisabledResponse, isChannelEnabled } from "@/server/channels/enabled";
import { isValidFormspreeSignature, normalizeWebsiteForm } from "@/server/website/form";
import { recibirEvento } from "@/server/webhooks/recibir";

/**
 * Website form intake. Two ways in, same URL:
 * - Formspree's webhook (paid plans): JSON `{ form, keys, submission }`,
 *   signed with `Formspree-Signature` when FORMSPREE_SIGNING_SECRET is set.
 * - The site posting its form straight here (any plan): JSON or a regular
 *   form post, from the browser, hence the CORS headers.
 *
 * The [token] segment must equal WEBSITE_FORM_TOKEN; anything else is a 404
 * with no side effects, same as a channel that's off.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function tokenValido(recibido: string, esperado: string | undefined): boolean {
  if (!esperado) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function OPTIONS() {
  if (!(await isChannelEnabled("website"))) return channelDisabledResponse();
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, { params }: Params) {
  if (!(await isChannelEnabled("website"))) return channelDisabledResponse();
  const env = getEnv();
  const { token } = await params;
  if (!tokenValido(token, env.WEBSITE_FORM_TOKEN)) return new Response(null, { status: 404 });

  const rawBody = await req.text();
  const signature = req.headers.get("formspree-signature");
  // A delivery that claims to be from Formspree must carry a valid signature
  // once a secret is configured. Direct posts from the site carry none.
  if (env.FORMSPREE_SIGNING_SECRET && signature) {
    if (!isValidFormspreeSignature(env.FORMSPREE_SIGNING_SECRET, signature, rawBody)) {
      return new Response(null, { status: 401, headers: CORS });
    }
  }

  const tipo = req.headers.get("content-type") ?? "";
  let body: unknown = null;
  try {
    if (tipo.includes("application/json")) {
      body = JSON.parse(rawBody);
    } else if (tipo.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(rawBody));
    } else if (tipo.includes("multipart/form-data")) {
      const form = await new Response(rawBody, { headers: { "content-type": tipo } }).formData();
      body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    } else {
      body = JSON.parse(rawBody);
    }
  } catch {
    return Response.json({ ok: false, error: "unreadable body" }, { status: 400, headers: CORS });
  }

  // Spam (honeypot) or an empty submission: acknowledge and drop.
  const lead = normalizeWebsiteForm(body);
  if (lead) {
    // Stored first and processed outside the route, like every channel: a
    // failure is retried by the sweep instead of losing the lead.
    const res = await recibirEvento("website", lead, rawBody, "website");
    if (!res.ok) return new Response(res.body, { status: res.status, headers: CORS });
  }

  // A plain HTML form post (no fetch) gets sent back to the site.
  const next = (body as Record<string, unknown> | null)?._next;
  if (!tipo.includes("application/json") && typeof next === "string" && /^https?:\/\//.test(next)) {
    return Response.redirect(next, 303);
  }
  return Response.json({ ok: true }, { headers: CORS });
}
