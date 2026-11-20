import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { effectiveSource } from "@/server/contact-source";
import type { FichaDto, PriorityValue } from "@/lib/types";
import {
  formatAddress,
  isBrand,
  servicesFromStored,
  type Brand,
  type ServiceType,
} from "@/lib/exteriors";

export function serializeContact(
  c: typeof schema.contact.$inferSelect,
  stageName: string | null = null,
  priority: PriorityValue | null = null,
  /** 018: si llegó por un anuncio, la fuente no capturada se deduce "anuncio". */
  llegoPorAnuncio = false,
  deal: {
    id: string;
    amountCents: number | null;
    currency: string | null;
    quoteDate: string | null;
    brand: string | null;
  } | null = null
) {
  const services = servicesFromStored(c.services);
  const address = {
    street: c.addressStreet,
    city: c.addressCity,
    state: c.addressState,
    zip: c.addressZip,
  };
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    channel: c.channel,
    address: { ...address, formatted: formatAddress(address) },
    services,
    notes: c.notes,
    aiPaused: c.aiPaused,
    stageName,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    source: effectiveSource(c.source, llegoPorAnuncio),
    priority,
    ficha: (c.ficha as FichaDto | null) ?? {},
    deal: deal
      ? {
          id: deal.id,
          amountCents: deal.amountCents,
          currency: deal.currency,
          quoteDate: deal.quoteDate,
          brand: deal.brand && isBrand(deal.brand) ? deal.brand : null,
        }
      : null,
  };
}

export type { Brand, ServiceType };

export async function getContactById(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Etapa actual del lead del contacto (si existe). */
export async function getContactStage(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select({ stage: schema.pipelineStage, lead: schema.lead })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.lead.stageId, schema.pipelineStage.id)
    )
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.contactId, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
