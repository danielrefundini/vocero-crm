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
      message: "el atajo lleva de 1 a 32 letras, números, - o _",
    }),
  texto: z.string().trim().min(1, "el texto no puede ir vacío").max(TEXTO_MAX),
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
  new QuickReplyError(409, "duplicado", `Ya hay una respuesta con el atajo /${atajo}`);

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
    throw new QuickReplyError(409, "tope", `Caben hasta ${TOPE_RESPUESTAS} respuestas rápidas`);
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
    if (!fila) throw new QuickReplyError(404, "not_found", "Respuesta no encontrada");
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
  if (!filas[0]) throw new QuickReplyError(404, "not_found", "Respuesta no encontrada");
}

/** Las cuatro de la demo (D6). Idempotente: no pisa ni duplica. */
export const RESPUESTAS_DEMO: { atajo: string; texto: string }[] = [
  {
    atajo: "hello",
    texto: "Hi {nombre}, thanks for reaching out. Which part of the exterior are you looking at?",
  },
  {
    atajo: "visit",
    texto: "I can come by the property. What city is it in, and which days work for you?",
  },
  {
    atajo: "services",
    texto:
      "We handle windows, roofing, siding, doors, gutters, attic insulation, and decks in DC, Maryland, and Virginia.",
  },
  {
    atajo: "next",
    texto: "I'll send a written quote after I see the property. I won't guess a price before that.",
  },
];
