import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  getContactById,
  getContactStage,
  serializeContact,
} from "@/server/contacts";
import { upsertFicha } from "@/server/bot/ficha";
import { validateAddressInput, normalizeEmail, mapServices } from "@/lib/exteriors";
import { applyStructuredFields } from "@/server/exteriors/apply";
import { pauseConversations } from "@/server/contacts-import";
import { cuentaComoAnuncio } from "@/lib/anuncios";
import {
  anuncioDelContacto,
  repararImagenSiFalta,
} from "@/server/attribution/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contact not found");
  const [stageRow, anuncio] = await Promise.all([
    getContactStage(session.organizationId, id),
    anuncioDelContacto(session.organizationId, id),
  ]);
  // 018 — Sin imagen todavía: se reintenta en segundo plano y llega por SSE.
  if (anuncio && !anuncio.imageAssetId) {
    repararImagenSiFalta(session.organizationId, id);
  }
  return Response.json({
    contact: serializeContact(
      contact,
      stageRow?.stage.name ?? null,
      stageRow?.lead.priority ?? null,
      cuentaComoAnuncio(anuncio),
      stageRow
        ? {
            id: stageRow.lead.id,
            amountCents: stageRow.lead.amountCents,
            currency: stageRow.lead.currency,
            quoteDate: stageRow.lead.quoteDate,
            brand: stageRow.lead.brand,
          }
        : null
    ),
    // 018 — de qué anuncio llegó, o null si escribió por su cuenta.
    anuncio,
    stage: stageRow
      ? {
          id: stageRow.stage.id,
          name: stageRow.stage.name,
          position: stageRow.stage.position,
          kind: stageRow.stage.kind,
        }
      : null,
    lead: stageRow ? { id: stageRow.lead.id } : null,
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(4000).nullable().optional(),
  /** 027 — El agente no le responde a esta persona; se lleva a su conversación. */
  aiPaused: z.boolean().optional(),
  archived: z.boolean().optional(),
  /**
   * Parche de la ficha: solo las claves que cambian. `null` borra una clave.
   * No es un reemplazo — el agente sigue escribiendo mientras el dueño
   * corrige, y mandar la ficha entera haría que el último en guardar le
   * borrara lo recién descubierto al otro.
   */
  ficha: z.record(z.string(), z.unknown()).optional(),
  email: z.string().max(200).nullable().optional(),
  addressStreet: z.string().max(200).nullable().optional(),
  addressCity: z.string().max(120).nullable().optional(),
  addressState: z.string().max(8).nullable().optional(),
  addressZip: z.string().max(12).nullable().optional(),
  services: z.array(z.string()).max(7).optional(),
  brand: z.enum(["daniel_exteriors", "presidential_exteriors"]).nullable().optional(),
  amountCents: z.number().int().min(0).nullable().optional(),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // La ficha va por su propia puerta —la MISMA que usa el cerebro externo en
  // `PUT /api/bot/ficha`— para heredar el merge y las cotas. Escribirla aquí
  // con un `set` plano sería un segundo camino con otras reglas.
  if (body.data.ficha !== undefined) {
    const res = await upsertFicha({
      organizationId: session.organizationId,
      contactId: id,
      ficha: body.data.ficha,
    });
    if (!res) return apiError(404, "not_found", "Contact not found");
  }

  const structured: Record<string, unknown> = {};
  if (body.data.email !== undefined) structured.email = body.data.email;
  if (body.data.addressStreet !== undefined) structured.address_street = body.data.addressStreet;
  if (body.data.addressCity !== undefined) structured.address_city = body.data.addressCity;
  if (body.data.addressState !== undefined) structured.address_state = body.data.addressState;
  if (body.data.addressZip !== undefined) structured.address_zip = body.data.addressZip;
  if (body.data.services !== undefined) {
    const mapped = mapServices(body.data.services);
    if (mapped.unrecognized.length > 0) {
      return apiError(422, "invalid_service", "Service type must be one of the listed exterior services");
    }
    structured.services = mapped.services;
  }
  if (body.data.brand !== undefined) structured.brand = body.data.brand;
  if (body.data.amountCents !== undefined) structured.amount_cents = body.data.amountCents;
  if (body.data.quoteDate !== undefined) structured.quote_date = body.data.quoteDate;
  if (Object.keys(structured).length > 0) {
    if (body.data.email) {
      const email = normalizeEmail(body.data.email);
      if (!email) return apiError(422, "invalid_email", "Email is not valid");
      structured.email = email;
    }
    if (
      body.data.addressStreet !== undefined ||
      body.data.addressCity !== undefined ||
      body.data.addressState !== undefined ||
      body.data.addressZip !== undefined
    ) {
      const existing = await getContactById(session.organizationId, id);
      if (!existing) return apiError(404, "not_found", "Contact not found");
      const address = validateAddressInput({
        street: body.data.addressStreet === undefined ? existing.addressStreet : body.data.addressStreet,
        city: body.data.addressCity === undefined ? existing.addressCity : body.data.addressCity,
        state: body.data.addressState === undefined ? existing.addressState : body.data.addressState,
        zip: body.data.addressZip === undefined ? existing.addressZip : body.data.addressZip,
      });
      if (!address.ok) return apiError(422, "invalid_address", address.error.message);
    }
    const existing = await getContactById(session.organizationId, id);
    if (!existing) return apiError(404, "not_found", "Contact not found");
    await applyStructuredFields({
      organizationId: session.organizationId,
      contactId: id,
      fields: structured,
      servicesMode: "replace",
    });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.name !== undefined) {
    set.name = body.data.name;
    // Lo escribio una persona: a partir de aqui WhatsApp ya no lo pisa (#51).
    set.nameSource = "manual";
  }
  if (body.data.notes !== undefined) set.notes = body.data.notes;
  if (body.data.archived !== undefined) {
    set.archivedAt = body.data.archived ? new Date() : null;
  }
  if (body.data.aiPaused !== undefined) set.aiPaused = body.data.aiPaused;

  const db = getDb();
  const updated = await db
    .update(schema.contact)
    .set(set)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        eq(schema.contact.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Contact not found");
  // 027: la pausa se lleva a la conversación que ya exista; sin esto no
  // tendría efecto hasta que naciera otra.
  if (body.data.aiPaused !== undefined) {
    await pauseConversations(session.organizationId, [id], body.data.aiPaused);
  }
  const anuncio = await anuncioDelContacto(session.organizationId, id);
  return Response.json({
    contact: serializeContact(updated[0], null, null, cuentaComoAnuncio(anuncio)),
  });
});
