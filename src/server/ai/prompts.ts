import type { schema } from "@/lib/db";

/**
 * 036 — Lo que queda de los prompts desde que el CRM no trae agente: el
 * conocimiento en texto (lo sirve `/api/bot/profile` y lo mide la pantalla
 * Agente) y el prompt del juez del Laboratorio. El del agente vive en el
 * cerebro (Nea: `app/prompt.py`).
 */

type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(empty knowledge base)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `Q: ${e.question}\nA: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente" | "sistema"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} You are an independent quality evaluator of WhatsApp agents. You evaluate ONE complete simulated conversation against the configured knowledge and behavior. You are strict: hallucination (making up data that isn't in the knowledge) is the most serious failure.`,
    "Respond ONLY with a JSON object with this schema:",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"cita textual del transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: no relevant problems. amarillo: could be improved. rojo: serious failure.",
    "- `sugerencia` is optional: include it when a new Q/A entry in the knowledge base would prevent the problem.",
    "- If the agent answered about a topic that is NOT in the knowledge → finding fuera_de_kb (or alucinacion if it stated concrete data).",
    "- If the customer asked for a human and there was no escalation → debio_escalar.",
    "- SISTEMA lines weren't written by anyone: they are CRM facts (for example, that the conversation was handed to a person). A handoff recorded there IS an escalation.",
  ].join("\n");

  const transcript = input.transcript
    .map(
      (t) =>
        `${t.role === "cliente" ? "CLIENTE" : t.role === "sistema" ? "SISTEMA" : "AGENTE"}: ${t.text}`
    )
    .join("\n");

  const user = [
    `SIMULATED PERSONA: ${input.persona}`,
    `CONFIGURED BEHAVIOR:\n${input.behaviorText || "(not configured)"}`,
    `CONFIGURED KNOWLEDGE:\n${input.kbText || "(empty)"}`,
    `FULL TRANSCRIPT:\n${transcript}`,
    "Evaluate and respond with the JSON.",
  ].join("\n\n");

  return { system, user };
}
