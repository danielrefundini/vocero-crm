import type { SessionContext } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import {
  onboardingStatus,
  type OnboardingStatus,
  type ReadinessStep,
} from "./status";

/**
 * La guía de inicio: cuatro pasos (cinco con la agenda) y nada más (issue #86).
 * 036 — «Conecta tu agente» es opcional: sin él, Vocero es una bandeja manual.
 *
 * Es lo primero que ve quien instala Vocero: configurar el agente, vincular
 * el proveedor de IA, conectar el número y, si la agenda existe en esta
 * instancia, dejarla lista. Al terminar, un botón enciende el agente. Lo
 * demás —la Bandeja, el Pipeline— ya está en el menú; la guía no lo repite.
 *
 * El estado de cada paso sale de `onboardingStatus`, la misma fuente que ya
 * verifica cada conexión: la guía no inventa su propia noción de «listo».
 * Puerto de `onboarding/guide.ts` de Vocero Cloud sin lo que allá es de la
 * plataforma (modelo fijado por soporte, agencias, planes).
 */
export type GuideStep = {
  key: "agent" | "ai" | "whatsapp" | "brain" | "calendar";
  title: string;
  description: string;
  done: boolean;
  /** 036 — En «Conecta tu agente» es externo (la receta del par): se hace en
   *  el entorno, no en una pantalla. */
  href: string;
  cta: string;
  /** Lo que falta, cuando no es lo obvio del paso. */
  hint: string | null;
  /** 036 — No cuenta para `complete`: sin cerebro, Vocero es una bandeja
   *  manual, y eso es un producto válido. */
  optional?: boolean;
};

export type Guide = {
  steps: GuideStep[];
  complete: boolean;
  /** El agente ya está encendido. */
  enabled: boolean;
  /** 036 — Hay un cerebro conectado y sano: tiene sentido encender. */
  brainConnected: boolean;
};

/** 036 — A dónde lleva «Conecta tu agente»: la receta del par. */
export const GUIA_DEL_PAR =
  "/guides/connect-agent";

const ready = (s: ReadinessStep | undefined) => s?.status === "ready";

/** Pura: de los pasos verificados a los de la guía. */
export function guideFrom(status: OnboardingStatus): Guide {
  const step = (key: ReadinessStep["key"]) =>
    status.steps.find((s) => s.key === key);
  const profile = step("profile");
  const ai = step("ai");
  const whatsapp = step("whatsapp");
  const calendar = step("calendar");
  const brain = step("brain");

  const steps: GuideStep[] = [
    {
      key: "agent",
      title: "Set up your agent",
      description:
        "Give it a name and tell it what your business does. If you want to see an example first, load the demo from the Inbox and swap in your details.",
      done: ready(profile),
      href: "/agent",
      cta: "Go to Agent",
      hint: ready(profile) ? null : (profile?.nextAction ?? null),
    },
    {
      key: "ai",
      title: "Link your AI provider",
      description:
        "It's the account your agent thinks with: OpenRouter or any OpenAI API-compatible provider. You create it and pay for it; here you just paste the key and pick the model.",
      done: ready(ai),
      href: "/settings/ai",
      cta: "Link provider",
      hint: ai?.problem ?? null,
    },
    {
      key: "whatsapp",
      title: "Link your WhatsApp number",
      description:
        "Connect the number your customers message. The CRM registers the webhook in Meta for you when you save.",
      done: ready(whatsapp),
      href: "/settings/whatsapp",
      cta: "Connect WhatsApp",
      hint: whatsapp?.problem ?? null,
    },
    {
      key: "brain",
      title: "Connect your agent",
      description:
        "Vocero doesn't ship an agent: the one you connect alongside answers (Nea, or your own). Without an agent, Vocero works as a manual inbox and you answer.",
      done: ready(brain),
      href: GUIA_DEL_PAR,
      cta: "How to connect it",
      hint: ready(brain) ? null : (brain?.problem ?? brain?.nextAction ?? null),
      optional: true,
    },
  ];
  // Sin agenda en esta instancia el paso no existe: pintarlo «no aplica»
  // sería justo el tipo de ruido que la guía evita.
  if (calendar && calendar.status !== "not_applicable") {
    steps.push({
      key: "calendar",
      title: "Set up your calendar",
      description:
        "Set your hours and how the meeting is delivered so your agent can book for you.",
      done: ready(calendar),
      href: "/guides/calendar",
      cta: "How to set it up",
      hint: calendar.problem,
    });
  }
  return {
    steps,
    complete: steps.every((s) => s.done || s.optional),
    enabled: status.enabled,
    brainConnected: ready(brain),
  };
}

export async function guideStatus(organizationId: string): Promise<Guide> {
  return guideFrom(await onboardingStatus(organizationId));
}

/**
 * ¿La guía es lo primero que ve esta persona al entrar?
 *
 * Solo a quien puede configurar (un miembro del equipo no puede hacer ninguno
 * de los pasos) y solo mientras falte algo: con todos los pasos listos y el
 * agente encendido se entra directo a la Bandeja, como siempre.
 *
 * Un negocio demo recién sembrado («Ferretería El Martillo») pasa por aquí
 * igual: el seed deja el agente configurado (paso 1 listo) pero no puede
 * vincular una llave de IA ni un número, y sin eso el agente no contesta.
 * Capturar `/` no encierra a nadie: el menú lleva a cualquier pantalla.
 */
export async function guideFirst(
  session: Pick<SessionContext, "organizationId" | "role">
): Promise<boolean> {
  if (!canConfigure(session.role)) return false;
  const guide = await guideStatus(session.organizationId);
  // 036 — Una bandeja manual (sin cerebro) no se queda atrapada en la guía.
  return !guide.complete || (guide.brainConnected && !guide.enabled);
}
