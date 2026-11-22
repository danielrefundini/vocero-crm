import { apiError } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { tokensMatch, websiteFormAllowed, websiteTokenFrom } from "@/server/website/auth";
import { acceptWebsiteLead, websiteBodySchema } from "@/server/website/intake";

export const dynamic = "force-dynamic";

/**
 * Alta pública de un formulario del sitio.
 * Auth: `Authorization: Bearer <WEBSITE_FORM_TOKEN>` o `X-Website-Form-Token`.
 * Sin token configurado, o con uno que no coincide, 401. No se registra el token.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(`website:${clientIp(req.headers)}`, {
    windowMs: 60_000,
    max: 60,
  });
  if (!limited.allowed) return apiError(429, "rate_limited", "Too many form submissions");

  if (!tokensMatch(websiteTokenFrom(req), process.env.WEBSITE_FORM_TOKEN)) {
    return apiError(401, "unauthorized", "Invalid website form token");
  }

  const forms = websiteFormAllowed({
    formsRaw: process.env.WEBSITE_FORM_ALLOWLIST,
    formId: null,
    origin: null,
  });
  if (!forms.ok && forms.reason === "malformed") {
    return apiError(
      403,
      "forms_config",
      "WEBSITE_FORM_ALLOWLIST must be a JSON array of form ids or origins, or a comma-separated list"
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(422, "invalid_body", "Body must be JSON");
  }
  const parsed = websiteBodySchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return apiError(422, "invalid_body", detail);
  }

  const allowed = websiteFormAllowed({
    formsRaw: process.env.WEBSITE_FORM_ALLOWLIST,
    formId: parsed.data.formId ?? null,
    origin: req.headers.get("origin"),
  });
  if (!allowed.ok) {
    return apiError(403, "form_rejected", "This form is not in WEBSITE_FORM_ALLOWLIST");
  }

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "This CRM does not have an organization yet");

  try {
    const result = await acceptWebsiteLead(organizationId, parsed.data);
    return Response.json(
      {
        ok: true,
        contactId: result.contactId,
        conversationId: result.conversationId,
        services: result.services,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && "code" in err && "message" in err) {
      const intake = err as { status: number; code: string; message: string };
      return apiError(intake.status, intake.code, intake.message);
    }
    console.warn("[website] intake failed");
    return apiError(500, "intake_failed", "Could not save the website lead");
  }
}
