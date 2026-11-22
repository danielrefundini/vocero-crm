import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  ATAJO_RE,
  normalizarAtajo,
  TEXTO_MAX,
  TOPE_RESPUESTAS,
  type RespuestaRapida,
} from "@/lib/respuestas-rapidas";

/**
 * 049 — Respuestas rápidas de la organización. Las rutas solo validan sesión
 * y permiso; aquí vive lo demás, para probarlo.
 */

export class QuickReplyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** El atajo llega como lo escribió la persona y se guarda normalizado. */
export const respuestaSchema = z.object({
  atajo: z
    .string()
    .transform(normalizarAtajo)
    .refine((a) => ATAJO_RE.test(a), {
      message: "the shortcut is 1 to 32 letters, numbers, - or _",
    }),
  texto: z.string().trim().min(1, "the text can't be empty").max(TEXTO_MAX),
});

function aDto(fila: typeof schema.quickReply.$inferSelect): RespuestaRapida {
  return { id: fila.id, atajo: fila.atajo, texto: fila.texto };
}

function esDuplicado(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

const duplicado = (atajo: string) =>
  new QuickReplyError(409, "duplicado", `There's already a reply with the shortcut /${atajo}`);

export async function listarRespuestas(organizationId: string): Promise<RespuestaRapida[]> {
  const filas = await getDb()
    .select()
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId))
    .orderBy(asc(schema.quickReply.atajo));
  return filas.map(aDto);
}

export async function crearRespuesta(
  organizationId: string,
  datos: z.infer<typeof respuestaSchema>
): Promise<RespuestaRapida> {
  const db = getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId));
  if (Number(n) >= TOPE_RESPUESTAS) {
    throw new QuickReplyError(409, "tope", `Up to ${TOPE_RESPUESTAS} quick replies fit`);
  }
  try {
    const [fila] = await db
      .insert(schema.quickReply)
      .values({ id: newId("quickReply"), organizationId, ...datos })
      .returning();
    return aDto(fila!);
  } catch (err) {
    if (esDuplicado(err)) throw duplicado(datos.atajo);
    throw err;
  }
}

export async function editarRespuesta(
  organizationId: string,
  id: string,
  datos: z.infer<typeof respuestaSchema>
): Promise<RespuestaRapida> {
  try {
    const [fila] = await getDb()
      .update(schema.quickReply)
      .set({ ...datos, updatedAt: new Date() })
      .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.id, id)))
      .returning();
    if (!fila) throw new QuickReplyError(404, "not_found", "Reply not found");
    return aDto(fila);
  } catch (err) {
    if (esDuplicado(err)) throw duplicado(datos.atajo);
    throw err;
  }
}

export async function borrarRespuesta(organizationId: string, id: string): Promise<void> {
  const filas = await getDb()
    .delete(schema.quickReply)
    .where(scoped(schema.quickReply.organizationId, organizationId, eq(schema.quickReply.id, id)))
    .returning({ id: schema.quickReply.id });
  if (!filas[0]) throw new QuickReplyError(404, "not_found", "Reply not found");
}

/** Las cuatro de la demo (D6). Idempotente: no pisa ni duplica. */
export const RESPUESTAS_DEMO: { atajo: string; texto: string }[] = [
  { atajo: "hola", texto: "Hi {nombre}! Thanks for reaching out. How can I help?" },
  { atajo: "horario", texto: "We're open Monday to Saturday from 8:00 AM to 7:00 PM, and Sunday from 9:00 AM to 2:00 PM." },
  { atajo: "envio", texto: "We deliver in town the same day if you order before 2:00 PM. Out of town, 2 to 4 days." },
  { atajo: "pago", texto: "We accept bank transfer, card and cash in store. I can send you the account details if you want to pay by transfer." },
];
