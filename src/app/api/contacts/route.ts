import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeUsPhone, emailIdentity, normalizeEmail, mapServices, validateAddressInput, isIsoDate } from "@/lib/exteriors";
import { digitsOnly, normalizeText } from "@/lib/search";
import { serializeContact } from "@/server/contacts";
import { createLeadForContact } from "@/server/inbox/lead-activity";

export const dynamic = "force-dynamic";

/**
 * Búsqueda tolerante en SQL, espejo de `matchesQuery` del cliente:
 * - nombre sin acentos ni mayúsculas (`translate`, sin depender de la
 *   extensión `unaccent`, que exigiría privilegios en la BD);
 * - teléfono por DÍGITOS, para poder teclearlo como se ve ("+52 555 000…").
 */
const UNACCENT_FROM = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const UNACCENT_TO = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();

  // Etapa de cada contacto en una consulta aparte: una subconsulta
  // correlacionada aquí choca con el `id` de `lead` ("column reference id is
  // ambiguous"), y un join duplicaría contactos con más de un lead.
  const leadStages = await db
    .select({
      contactId: schema.lead.contactId,
      stageName: schema.pipelineStage.name,
      priority: schema.lead.priority,
      leadId: schema.lead.id,
      amountCents: schema.lead.amountCents,
      currency: schema.lead.currency,
      quoteDate: schema.lead.quoteDate,
      brand: schema.lead.brand,
    })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(scoped(schema.lead.organizationId, session.organizationId));
  const stageByContact = new Map(
    leadStages.map((r) => [r.contactId, r.stageName])
  );
  const dealByContact = new Map(leadStages.map((r) => [r.contactId, r]));

  const qDigits = q ? digitsOnly(q) : "";
  // El patrón viaja normalizado igual que la columna, y con los comodines de
  // LIKE escapados para que un "%" tecleado no liste todo.
  const qLike = q ? normalizeText(q).replace(/[\\%_]/g, "\\$&") : "";
  const search =
    q && q.length > 0
      ? or(
          sql`lower(translate(${schema.contact.name}, ${UNACCENT_FROM}, ${UNACCENT_TO}))
              like ${`%${qLike}%`}`,
          // Un dígito suelto barrería el directorio entero: mínimo 3.
          qDigits.length >= 3
            ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g')
                  like ${`%${qDigits}%`}`
            : undefined
        )
      : undefined;

  // El filtro de etapa se aplica ANTES del límite: si no, un contacto de la
  // etapa buscada podría quedar fuera por el corte de 200.
  const stageContactIds = stage
    ? leadStages.filter((r) => r.stageName === stage).map((r) => r.contactId)
    : null;
  if (stageContactIds?.length === 0) return Response.json({ contacts: [] });

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        search,
        stageContactIds ? inArray(schema.contact.id, stageContactIds) : undefined
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const contacts = rows
    .filter((c) => includeArchived || !c.archivedAt)
    .map((c) =>
      serializeContact(
        c,
        stageByContact.get(c.id) ?? null,
        dealByContact.get(c.id)?.priority ?? null,
        false,
        dealByContact.get(c.id)
          ? {
              id: dealByContact.get(c.id)!.leadId,
              amountCents: dealByContact.get(c.id)!.amountCents,
              currency: dealByContact.get(c.id)!.currency,
              quoteDate: dealByContact.get(c.id)!.quoteDate,
              brand: dealByContact.get(c.id)!.brand,
            }
          : null
      )
    );
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  notes: z.string().max(4000).optional(),
  source: z.enum(["anuncio", "organico", "referido", "conocido", "otro"]).optional(),
  stageId: z.string().min(1).optional(),
  addressStreet: z.string().max(200).optional(),
  addressCity: z.string().max(120).optional(),
  addressState: z.string().max(8).optional(),
  addressZip: z.string().max(12).optional(),
  services: z.array(z.string()).max(7).optional(),
  brand: z.enum(["daniel_exteriors", "presidential_exteriors"]).optional(),
  amountCents: z.number().int().min(0).nullable().optional(),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const email = body.data.email ? normalizeEmail(body.data.email) : null;
  if (body.data.email?.trim() && !email) {
    return apiError(422, "invalid_email", "Email is not valid");
  }
  const phone = body.data.phone?.trim() ? normalizeUsPhone(body.data.phone) : null;
  if (body.data.phone?.trim() && !phone) {
    return apiError(
      422,
      "invalid_phone",
      "Use a US phone: 10 digits, or 11 starting with country code 1"
    );
  }
  if (!phone && !email) {
    return apiError(422, "missing_identity", "A phone number or an email is required");
  }
  const address = validateAddressInput({
    street: body.data.addressStreet,
    city: body.data.addressCity,
    state: body.data.addressState,
    zip: body.data.addressZip,
  });
  if (!address.ok) return apiError(422, "invalid_address", address.error.message);
  if (body.data.quoteDate && !isIsoDate(body.data.quoteDate)) {
    return apiError(422, "invalid_date", "Quote date must be YYYY-MM-DD");
  }
  const mappedServices = mapServices(body.data.services ?? []);
  if (mappedServices.unrecognized.length > 0) {
    return apiError(422, "invalid_service", "Service type must be one of the listed exterior services");
  }
  const services = mappedServices.services;

  const db = getDb();
  const channel = phone ? "whatsapp" : "email";
  const identity = phone ?? emailIdentity(email!);
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      channel,
      name: body.data.name,
      nameSource: "manual",
      phone,
      email,
      waIdentity: identity,
      notes: body.data.notes ?? null,
      source: body.data.source ?? null,
      addressStreet: address.address.street,
      addressCity: address.address.city,
      addressState: address.address.state,
      addressZip: address.address.zip,
      services,
    })
    .onConflictDoNothing({
      target: [
        schema.contact.organizationId,
        schema.contact.channel,
        schema.contact.waIdentity,
      ],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "A contact with that phone or email already exists");
  }

  const lead = await createLeadForContact({
    organizationId: session.organizationId,
    contactId: inserted[0].id,
    stageId: body.data.stageId,
    source: "dueno",
    actorUserId: session.userId,
    brand: body.data.brand ?? "daniel_exteriors",
  });
  if (!lead) {
    return apiError(422, "no_stage", "The pipeline has no open stage for this contact");
  }
  if (body.data.amountCents !== undefined || body.data.quoteDate !== undefined || body.data.brand) {
    await db
      .update(schema.lead)
      .set({
        ...(body.data.amountCents !== undefined
          ? {
              amountCents: body.data.amountCents,
              currency: body.data.amountCents === null ? null : "USD",
            }
          : {}),
        ...(body.data.quoteDate !== undefined ? { quoteDate: body.data.quoteDate } : {}),
        ...(body.data.brand ? { brand: body.data.brand } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.lead.id, lead.id));
  }

  return Response.json(
    { contact: serializeContact(inserted[0]), lead: { id: lead.id } },
    { status: 201 }
  );
});
