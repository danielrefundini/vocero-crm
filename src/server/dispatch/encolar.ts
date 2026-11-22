import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { encolarDespacho } from "@/server/dispatch/outbox";
import { iniciarWorker, programarTanda } from "@/server/dispatch/worker";

/**
 * 021 — El enganche de la ingesta: un mensaje entrante real ya está en la
 * bandeja y hay un cerebro configurado, así que su turno se ENCOLA.
 *
 * 036 — Desde que el CRM no trae agente, este es el único camino por el que
 * alguien contesta, y el interruptor de la pantalla Agente
 * (`agent_profile.enabled`) decide si se toma: apagado, la conversación
 * queda en la bandeja para una persona.
 *
 * Nunca lanza. Corre al final de la ingesta, dentro del `after()` del webhook:
 * una excepción aquí no puede costarle a ese payload los mensajes que vengan
 * detrás. Lo que no se encoló sigue en la bandeja.
 */
export async function despacharAlCerebro(
  conversationId: string,
  organizationId: string,
  messageId: string,
  mensaje: { type: string; text: string | null }
): Promise<void> {
  try {
    const [conv] = await getDb()
      .select({
        aiEnabled: schema.conversation.aiEnabled,
        handoffAt: schema.conversation.handoffAt,
        isTest: schema.conversation.isTest,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.id, conversationId),
          eq(schema.conversation.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!conv) return;

    // Pausada por una persona o traspasada por el agente: no se despacha. Es
    // la misma bandera que respeta `/api/bot/messages`, y aquí la respeta
    // cualquier cerebro sin tener que acordarse. El Laboratorio no pasa por la
    // ingesta, pero una conversación de prueba no sale del CRM por ningún
    // camino.
    if (!conv.aiEnabled || conv.handoffAt || conv.isTest) return;

    // Evita gastar una llamada al cerebro en interacciones sociales obvias.
    // El mensaje sigue guardado y visible en la bandeja para el equipo.
    if (esMensajeSocialSinLead(mensaje.type, mensaje.text)) return;

    const [perfil] = await getDb()
      .select({ enabled: schema.agentProfile.enabled })
      .from(schema.agentProfile)
      .where(eq(schema.agentProfile.organizationId, organizationId))
      .limit(1);
    if (!perfil?.enabled) return;

    // 025 — El despacho anota qué entrante lo provoca: es lo que le debe al
    // cerebro, aunque después la conversación tenga una respuesta.
    const { notBefore } = await encolarDespacho({
      organizationId,
      conversationId,
      messageIds: [messageId],
    });
    iniciarWorker();
    // Que despierte justo cuando la ventana venza, no en su siguiente barrido.
    programarTanda(notBefore);
  } catch (err) {
    console.error("[despacho] no se pudo encolar el turno:", err);
  }
}

/**
 * Omite del despacho mensajes con intención social clara, sin usar un LLM.
 * Las coincidencias son deliberadamente conservadoras: preguntas de precio,
 * servicio, reparación, instalación o cita siempre continúan al cerebro.
 */
function esMensajeSocialSinLead(type: string, text: string | null): boolean {
  if (type === "sticker") return true;
  if (type !== "text") return false;

  const normalizado = (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Un texto formado solo por emojis o puntuación no expresa una solicitud.
  if (!normalizado) return true;

  const contieneIntencionComercial =
    /\b(?:quote|estimate|price|pricing|cost|how much|repair|replace|replacement|install|installation|schedule|appointment|inspection|need|looking for|interested|can you|do you|do yall|provide|offer|cotizacion|presupuesto|precio|cuanto|reparar|reemplazar|instalacion|cita|necesito|orcamento|preco|quanto|consertar|trocar|instalacao|agendar|preciso|pode|podem|tem como|queria)\b/.test(
      normalizado
    );
  if (contieneIntencionComercial) return false;

  const sociales = new Set([
    "hi", "hello", "hey", "hola", "oi", "ola", "bom dia", "boa tarde",
    "boa noite", "buenos dias", "buenas tardes", "buenas noches",
    "thanks", "thank you", "thank you so much", "thx", "ty", "obrigado",
    "obrigada", "muito obrigado", "muito obrigada", "valeu", "gracias",
    "muchas gracias", "congrats", "congratulations", "parabens",
    "parabens pelo trabalho", "parabens pelo projeto", "felicidades",
    "great", "nice", "beautiful", "amazing", "awesome", "excellent",
    "lovely", "fantastic", "wonderful", "great job", "nice job",
    "great work", "nice work", "beautiful work", "amazing work",
    "excellent work", "awesome work", "beautiful project", "great project",
    "looks great", "looks beautiful", "looks amazing", "good job",
    "good work", "buen trabajo", "excelente trabajo", "muy bonito",
    "que bonito", "que lindo", "que buen trabajo", "buen trabajo",
    "bom trabalho", "otimo trabalho", "trabalho lindo", "trabalho legal",
    "trabalho incrivel", "projeto lindo", "projeto legal", "servico excelente",
    "que trabalho legal", "que trabalho lindo", "ficou lindo", "ficou otimo",
    "ficou incrivel", "muito bonito", "muito legal", "parabens pelo trabalho",
  ]);
  if (sociales.has(normalizado)) return true;

  const tokens = normalizado.split(" ");
  const palabrasDeElogio = new Set([
    "great", "nice", "beautiful", "amazing", "awesome", "excellent", "lovely",
    "fantastic", "wonderful", "gorgeous", "stunning", "congrats",
    "congratulations", "parabens", "felicidades", "bom", "boa", "otimo",
    "legal", "lindo", "linda", "incrivel", "bonito", "bonita", "excelente",
    "hermoso", "hermosa", "feliz",
  ]);
  const palabrasSociales = new Set([
    ...palabrasDeElogio, "hi", "hello", "hey", "hola", "oi", "ola", "thanks",
    "thank", "you", "thx", "ty", "obrigado", "obrigada", "valeu", "gracias",
    "muchas", "muito", "pelo", "pela", "por", "que", "el", "la", "the", "a",
    "an", "your", "this", "that", "these", "those", "my", "our", "so",
    "really", "very", "looks", "look", "is", "are", "was", "were", "job",
    "work", "project", "house", "home", "roof", "windows", "window", "siding",
    "doors", "door", "deck", "team", "guys", "trabalho", "projeto", "casa",
    "telhado", "janelas", "janela", "portas", "porta", "equipe", "ficou",
    "esta", "show", "bacana", "demais", "buen", "bueno", "bonito", "bonita",
    "hermoso", "hermosa", "muy", "buenos", "buenas", "dela", "del", "de",
    "and", "on", "it", "keep", "up", "guys", "equipo", "seu", "sua", "meu",
    "minha", "esse", "essa", "o", "os", "as", "um", "uma",
  ]);
  if (
    tokens.length <= 16 &&
    tokens.some((token) => palabrasDeElogio.has(token)) &&
    tokens.every((token) => palabrasSociales.has(token))
  ) {
    return true;
  }

  // Variantes curtas de elogios; no coinciden si la persona pide algo concreto.
  return /^(?:(?:your|this|that|the) )?(?:(?:roof|windows?|siding|doors?|deck|house|home|project|work|job) )?(?:looks?|is|are|was|were) (?:so |really |very )?(?:great|nice|beautiful|amazing|awesome|excellent|lovely|fantastic|wonderful|gorgeous|stunning)$/.test(
    normalizado
  );
}
