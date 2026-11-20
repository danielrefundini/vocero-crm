import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  emailIdentity,
  formatAddress,
  mapServices,
  normalizeEmail,
  normalizeUsPhone,
  smsIdentity,
  unrecognizedServiceNote,
  validateAddressInput,
  type ServiceType,
} from "@/lib/exteriors";
import { getOrCreateContactByIdentity } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { createLeadForContact } from "@/server/inbox/lead-activity";

export class IntakeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "IntakeError";
    this.status = status;
    this.code = code;
  }
}

export const websiteBodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(40).optional(),
  zip: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  service: z.union([z.string().max(300), z.array(z.string().max(80)).max(12)]).optional(),
  services: z.union([z.string().max(300), z.array(z.string().max(80)).max(12)]).optional(),
  message: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
  formId: z.string().max(120).optional(),
  submissionId: z.string().max(120).optional(),
});

export type WebsiteBody = z.infer<typeof websiteBodySchema>;

/**
 * Alta de un lead que llegó por un formulario del sitio. Crea o reúne el
 * contacto, abre el hilo (SMS si hay teléfono, correo si solo hay email) y
 * deja el mensaje en la bandeja. `service` se traduce a la lista cerrada;
 * lo que no se reconoce se anota y no tumba el alta.
 */
export async function acceptWebsiteLead(
  organizationId: string,
  body: WebsiteBody
): Promise<{ contactId: string; conversationId: string; services: ServiceType[] }> {
  const email = body.email ? normalizeEmail(body.email) : null;
  if (body.email?.trim() && !email) {
    throw new IntakeError(422, "invalid_email", "Email is not valid");
  }
  const phone = body.phone?.trim() ? normalizeUsPhone(body.phone) : null;
  if (body.phone?.trim() && !phone) {
    throw new IntakeError(
      422,
      "invalid_phone",
      "Phone must be a US number (10 digits, or starting with country code 1)"
    );
  }
  if (!phone && !email) {
    throw new IntakeError(422, "missing_identity", "A phone number or an email is required");
  }

  const addressInput = {
    street: body.street ?? (body.address && !body.city ? body.address : undefined),
    city: body.city,
    state: body.state,
    zip: body.zip,
  };
  const address = validateAddressInput(addressInput);
  if (!address.ok) {
    throw new IntakeError(422, "invalid_address", address.error.message);
  }

  const mapped = mapServices(body.services ?? body.service);
  const name =
    body.name?.trim() ||
    email?.split("@")[0] ||
    (phone ? `Lead ${phone}` : "Website lead");

  const contact = phone
    ? await upsertSmsContact(organizationId, {
        phone,
        email,
        name,
      })
    : (
        await getOrCreateContactByIdentity(organizationId, {
          identity: emailIdentity(email!),
          channel: "email",
          phone: null,
          waUserId: null,
          profileName: name,
        })
      ).contact;

  const noteBits = [
    body.notes?.trim() || null,
    unrecognizedServiceNote(mapped.unrecognized),
  ].filter((bit): bit is string => Boolean(bit));

  const db = getDb();
  await db
    .update(schema.contact)
    .set({
      name: contact.nameSource === "manual" && contact.name ? contact.name : name,
      nameSource: "manual",
      email: email ?? contact.email,
      phone: phone ?? contact.phone,
      addressStreet: address.address.street ?? contact.addressStreet,
      addressCity: address.address.city ?? contact.addressCity,
      addressState: address.address.state ?? contact.addressState,
      addressZip: address.address.zip ?? contact.addressZip,
      services: union(readServices(contact.services), mapped.services),
      source: contact.source ?? "organico",
      notes: appendNotes(contact.notes, noteBits),
      updatedAt: new Date(),
    })
    .where(eq(schema.contact.id, contact.id));

  const text = threadText({
    services: mapped.services,
    unrecognized: mapped.unrecognized,
    message: body.message?.trim() || body.notes?.trim() || "",
    address: formatAddress(address.address) || body.address?.trim() || "",
  });
  const submission = body.submissionId?.trim() || newId("message");
  await ingestInboundMessage({
    organizationId,
    identity: {
      identity: phone ? smsIdentity(phone) : emailIdentity(email!),
      channel: phone ? "sms" : "email",
      phone,
      waUserId: null,
      profileName: name,
    },
    waMessageId: `web:${submission}`,
    type: "text",
    text,
    timestamp: String(Math.floor(Date.now() / 1000)),
  });

  const conv = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);

  await createLeadForContact({
    organizationId,
    contactId: contact.id,
    source: "sistema",
    brand: "daniel_exteriors",
  });
  await db
    .update(schema.lead)
    .set({ brand: "daniel_exteriors", updatedAt: new Date() })
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.contactId, contact.id),
        isNull(schema.lead.brand)
      )
    );

  const conversationId = conv[0]?.id;
  if (!conversationId) {
    throw new IntakeError(500, "no_conversation", "The lead was saved but the inbox thread was not");
  }
  return { contactId: contact.id, conversationId, services: mapped.services };
}

async function upsertSmsContact(
  organizationId: string,
  input: { phone: string; email: string | null; name: string }
) {
  const db = getDb();
  const identity = smsIdentity(input.phone);
  const found = await db
    .select()
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.channel, "sms"),
        eq(schema.contact.waIdentity, identity)
      )
    )
    .limit(1);
  if (found[0]) return found[0];

  if (input.email) {
    const byEmail = await db
      .select()
      .from(schema.contact)
      .where(
        and(
          eq(schema.contact.organizationId, organizationId),
          eq(schema.contact.channel, "email"),
          eq(schema.contact.waIdentity, emailIdentity(input.email))
        )
      )
      .limit(1);
    const emailContact = byEmail[0];
    if (emailContact) {
      const moved = await db
        .update(schema.contact)
        .set({
          channel: "sms",
          waIdentity: identity,
          phone: input.phone,
          updatedAt: new Date(),
        })
        .where(eq(schema.contact.id, emailContact.id))
        .returning();
      await db
        .update(schema.conversation)
        .set({ channel: "sms", updatedAt: new Date() })
        .where(eq(schema.conversation.contactId, emailContact.id));
      if (moved[0]) return moved[0];
    }
  }

  const created = await getOrCreateContactByIdentity(organizationId, {
    identity,
    channel: "sms",
    phone: input.phone,
    waUserId: null,
    profileName: input.name,
  });
  if (input.phone && !created.contact.phone) {
    await db
      .update(schema.contact)
      .set({ phone: input.phone })
      .where(eq(schema.contact.id, created.contact.id));
    created.contact.phone = input.phone;
  }
  return created.contact;
}

function readServices(value: unknown): ServiceType[] {
  return mapServices(value).services;
}

function union(a: ServiceType[], b: ServiceType[]): ServiceType[] {
  const out = [...a];
  for (const item of b) if (!out.includes(item)) out.push(item);
  return out;
}

function appendNotes(prev: string | null, lines: string[]): string | null {
  const extra = lines.filter((line) => line && !prev?.includes(line));
  if (extra.length === 0) return prev;
  return prev ? `${prev}\n${extra.join("\n")}` : extra.join("\n");
}

function threadText(input: {
  services: ServiceType[];
  unrecognized: string[];
  message: string;
  address: string;
}): string {
  const lines = ["Website form"];
  if (input.services.length > 0) lines.push(`Service: ${input.services.join(", ")}`);
  if (input.unrecognized.length > 0) {
    lines.push(`[Unrecognized service] ${input.unrecognized.join("; ")}`);
  }
  if (input.address) lines.push(`Property: ${input.address}`);
  if (input.message) lines.push("", input.message);
  return lines.join("\n");
}
