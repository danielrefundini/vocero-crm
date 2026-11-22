/**
 * 054 — Los eventos que se pintan en el hilo (cambios de etapa y el traspaso a
 * una persona): el DTO y su texto. Puro, para probarlo sin servidor.
 */
import { LOSS_REASON_LABEL, type LossReason, type StageChangeSource } from "./types";

export type EventoHiloDto = {
  id: string;
  tipo: "etapa" | "traspaso";
  texto: string;
  createdAt: string;
};

/**
 * Por qué la IA dejó de contestar, con las palabras del panel del contacto.
 * `hostilidad` faltaba allá: se agrega aquí y el panel lo usa.
 */
export const HANDOFF_LABELS: Record<string, string> = {
  cliente: "The customer asked for a person",
  modelo: "The agent chose to hand off",
  error: "The AI provider failed",
  ventana: "The 24-hour window is closed",
  hostilidad: "The customer got aggressive and the agent stepped back",
  manual_reply: "You replied from the phone — AI is paused",
};

/** D1 — «Pasó a Interesado · por Ana», «Entró al embudo en Nuevo»… */
export function textoEventoEtapa(e: {
  fromStageName: string | null;
  toStageName: string;
  lossReason: LossReason | string | null;
  source: StageChangeSource | string;
  actorNombre: string | null;
}): string {
  const base =
    e.fromStageName === null
      ? `Entered the pipeline at ${e.toStageName}`
      : `Moved to ${e.toStageName}`;
  const motivo =
    e.lossReason && e.lossReason in LOSS_REASON_LABEL
      ? ` · ${LOSS_REASON_LABEL[e.lossReason as LossReason]}`
      : "";
  const quien = e.actorNombre
    ? ` · by ${e.actorNombre}`
    : e.source === "bot"
      ? " · by the agent"
      : "";
  return `${base}${motivo}${quien}`;
}

/** D1 — «La IA se pausó: el cliente pidió un humano». */
export function textoTraspaso(motivo: string | null): string {
  const etiqueta = motivo ? HANDOFF_LABELS[motivo] : undefined;
  if (!etiqueta) return "The AI paused";
  return `The AI paused: ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
}
