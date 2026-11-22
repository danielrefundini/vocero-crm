/**
 * Las personas GUIONADAS del Laboratorio (FR-030). El cliente simulado no
 * usa LLM: son secuencias fijas — determinismo total del lado del cliente.
 * El agente que responde es el REAL (mismo pipeline de US3).
 */

export type Persona = {
  key: string;
  label: string;
  description: string;
  /** Teléfono sintético estable (jamás un número real). */
  phone: string;
  contactName: string;
  script: string[];
};

export const PERSONAS: Persona[] = [
  {
    key: "comprador_decidido",
    label: "Decisive buyer",
    description: "Knows what they want and goes straight to buying.",
    phone: "5210000000001",
    contactName: "[Test] Decisive buyer",
    script: [
      "Hi, good afternoon",
      "Do you have cordless drills available?",
      "Great, how much is the best seller?",
      "Sold, I'll take it. How do I pay?",
    ],
  },
  {
    key: "pregunton_precios",
    label: "Price shopper",
    description: "Asks price after price without deciding.",
    phone: "5210000000002",
    contactName: "[Test] Price shopper",
    script: [
      "Hi, how much is the hammer?",
      "And the Phillips screwdriver?",
      "How much for the box of 2-inch nails?",
      "Is there a discount if I buy several things?",
      "Ok, I'll think about it",
    ],
  },
  {
    key: "cliente_enojado",
    label: "Angry customer",
    description: "Shows up upset about a problem with their purchase.",
    phone: "5210000000003",
    contactName: "[Test] Angry customer",
    script: [
      "Hey, this is ridiculous",
      "I bought a sander last week and it won't turn on anymore, it's junk",
      "Are you going to answer me or what? I want a solution NOW",
      "Well I hope so, because I'm not losing my money",
    ],
  },
  {
    key: "fuera_de_kb",
    label: "Question outside the knowledge",
    description: "Asks something the knowledge base doesn't cover (fuera_de_kb).",
    phone: "5210000000004",
    contactName: "[Test] Outside the knowledge",
    script: [
      "Hi, a question",
      "What's your warranty and return policy?",
      "And if the product fails after two months, will you replace it?",
      "Where do I file a warranty claim?",
    ],
  },
  {
    key: "pide_humano",
    label: "Asks for a human",
    description: "Wants to be helped by a person (must escalate).",
    phone: "5210000000005",
    contactName: "[Test] Asks for a human",
    script: [
      "Hi",
      "I have a sensitive issue with an order",
      "I'd rather be helped by a person, I want to talk to a human",
      "Thanks",
    ],
  },
  {
    key: "errores_modismos",
    label: "Typos and slang",
    description: "Writes with spelling mistakes and casual slang.",
    phone: "5210000000006",
    contactName: "[Test] Typos and slang",
    script: [
      "yo u guys sell paint?",
      "hey do u kno if u got thinner",
      "how much 4 a galon of white interior paint",
      "k, gonna swing by the store in a bit, cool",
    ],
  },
  // 033 — Las dos que faltaban para probar los frenos del agente: la
  // hostilidad sostenida (debe cerrar con dignidad y escalar) y la
  // conversación que no va a ningún lado (debe despedirse y dejar de seguir).
  {
    key: "hostil",
    label: "Hostile",
    description: "Insults persistently; must close with dignity and escalate.",
    phone: "5210000000007",
    contactName: "[Test] Hostile",
    script: [
      "Hey, is this a scam or what",
      "All talk, cheap bots that are good for nothing",
      "Knock it off, you're a bunch of scammers, I don't believe a thing",
      "What are you looking at, say something useful",
    ],
  },
  {
    key: "sin_rumbo",
    label: "Aimless",
    description: "Only sends filler; must say goodbye and stop chasing.",
    phone: "5210000000008",
    contactName: "[Test] Aimless",
    script: ["Hi", "ok", "jaja", "👍", "ok thanks", "sale"],
  },
];

export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label])
);
