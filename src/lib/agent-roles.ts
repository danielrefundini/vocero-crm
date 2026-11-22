/**
 * 034 — Roles como datos.
 *
 * Un rol es lo que hace el agente: instrucciones, herramientas encendidas y
 * las personas con que el Laboratorio lo prueba. El runtime es uno y vive en
 * el cerebro; lo que cambia de un negocio a otro vive aquí y en el perfil, y
 * viaja por `GET /api/bot/profile`. Encender o apagar una herramienta es
 * editar el perfil, sin redesplegar nada.
 *
 * Puro y sin dependencias del servidor: lo usan la API, la pantalla Agente y
 * el Laboratorio.
 */

export type ClaveHerramienta =
  | "ficha"
  | "etapa"
  | "agendar"
  | "reprogramar"
  | "salida"
  | "escalar";

export type Herramienta = {
  clave: ClaveHerramienta;
  etiqueta: string;
  descripcion: string;
  /** Solo existe con la bandera `AGENDA` encendida. */
  agenda?: true;
  /** Red de seguridad: no se apaga (spec 034, D2). */
  fija?: true;
};

/** El catálogo. Las claves son contrato con el cerebro: no se renombran. */
export const HERRAMIENTAS: readonly Herramienta[] = [
  {
    clave: "ficha",
    etiqueta: "Fill in the profile",
    descripcion:
      "Writes down what it learns about the customer in their CRM profile.",
  },
  {
    // 038 — Solo hacia adelante y entre etapas abiertas: ganar o perder un
    // trato lo decide una persona.
    clave: "etapa",
    etiqueta: "Move stage",
    descripcion:
      "Moves the lead forward in the pipeline when the conversation warrants it. It never marks it as won or lost.",
  },
  {
    clave: "agendar",
    etiqueta: "Book appointments",
    descripcion: "Offers real times from the calendar and books the one the customer picks.",
    agenda: true,
  },
  {
    clave: "reprogramar",
    etiqueta: "Reschedule appointments",
    descripcion: "Moves an already-booked appointment to another offered time.",
    agenda: true,
  },
  {
    clave: "salida",
    etiqueta: "Graceful exit",
    descripcion: "Kindly says goodbye to people who don't qualify, with resources if there are any.",
  },
  {
    clave: "escalar",
    etiqueta: "Hand off to a person",
    descripcion:
      "When the customer asks, when facing hostility, or for what it doesn't know. Always on.",
    fija: true,
  },
];

export const CLAVES_HERRAMIENTA: readonly ClaveHerramienta[] = HERRAMIENTAS.map(
  (h) => h.clave
);

export function esClaveHerramienta(valor: unknown): valor is ClaveHerramienta {
  return typeof valor === "string" && (CLAVES_HERRAMIENTA as string[]).includes(valor);
}

/**
 * Las herramientas encendidas de un perfil: `null` = todas (lo que tiene una
 * instalación que actualiza). `escalar` siempre va, y en el orden del
 * catálogo. Lo que no es del catálogo se ignora.
 */
export function herramientasEfectivas(
  tools: readonly string[] | null | undefined
): ClaveHerramienta[] {
  if (!tools) return [...CLAVES_HERRAMIENTA];
  const encendidas = new Set(tools.filter(esClaveHerramienta));
  return HERRAMIENTAS.filter((h) => h.fija || encendidas.has(h.clave)).map((h) => h.clave);
}

export type ClaveRol = "calificador";

export type Rol = {
  clave: ClaveRol;
  etiqueta: string;
  descripcion: string;
  instrucciones: string;
  reglasDeEscalado: string;
  herramientas: readonly ClaveHerramienta[];
  /** Claves de las personas del Laboratorio (`src/server/lab/personas.ts`). */
  personas: readonly string[];
};

/** Los roles. En 2.0, uno: el Calificador (spec 034, D7). */
export const ROLES: Record<ClaveRol, Rol> = {
  calificador: {
    clave: "calificador",
    etiqueta: "Qualifier",
    descripcion:
      "Serves whoever writes in, understands what they need, qualifies them and books with the team when appropriate.",
    instrucciones: [
      "You serve the people who message the business. Your job:",
      "1. Understand what each person needs, one question at a time.",
      "2. Answer with what the business knowledge says; if something isn't there, don't make it up: offer to pass the question to the team.",
      "3. Qualify them: note in the profile what you learn (what they're looking for, by when, budget if they say).",
      "4. If they qualify, offer them an appointment with the team. If not, say goodbye kindly and, if there are resources, share them.",
    ].join("\n"),
    reglasDeEscalado:
      "Hand the conversation to a person if the customer asks, if they get hostile, if it's a complaint or a problem with a purchase, or if they ask something the knowledge doesn't cover and it matters to them.",
    herramientas: CLAVES_HERRAMIENTA,
    personas: [
      "comprador_decidido",
      "pregunton_precios",
      "cliente_enojado",
      "hostil",
      "fuera_de_kb",
      "pide_humano",
      "errores_modismos",
      "sin_rumbo",
    ],
  },
};

export function esClaveRol(valor: unknown): valor is ClaveRol {
  return typeof valor === "string" && valor in ROLES;
}

/** El rol de un perfil; uno que ya no exista cae al Calificador. */
export function rolDe(role: string | null | undefined): Rol {
  return esClaveRol(role) ? ROLES[role] : ROLES.calificador;
}
