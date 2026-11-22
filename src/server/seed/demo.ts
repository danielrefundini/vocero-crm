import { eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { RESPUESTAS_DEMO } from "@/server/quick-replies";

/**
 * Negocio de demostración "Ferretería El Martillo" (FR-075).
 * Idempotente: borra los datos demo previos de la organización (scoped por
 * los teléfonos demo) y reinserta. El KB queda lleno EXCEPTO garantías y
 * devoluciones — hueco INTENCIONAL para que el Laboratorio encuentre algo
 * real en la primera corrida.
 */

type Db = ReturnType<typeof getDb>;

const HOURS = 60 * 60 * 1000;

const DEMO_CONTACTS: {
  phone: string;
  name: string;
  notes?: string;
  stage: string;
  thread: { dir: "in" | "out"; text: string; hoursAgo: number; ai?: boolean }[];
}[] = [
  {
    phone: "5215612340001",
    name: "Maria Lopez",
    stage: "Interested",
    notes: "Remodeling her kitchen; looking for power tools.",
    thread: [
      { dir: "in", text: "Hi, do you have cordless drills?", hoursAgo: 5 },
      { dir: "out", text: "Hi Maria! Yes: we have the Ryobi 18V at $99 and the DeWalt 20V MAX at $179, both with battery included.", hoursAgo: 5, ai: true },
      { dir: "in", text: "Does the Ryobi include drill bits?", hoursAgo: 4 },
      { dir: "out", text: "It includes a basic set of 5 bits for concrete and wood. If you need more, the 30-piece set is $19.", hoursAgo: 4, ai: true },
      { dir: "in", text: "Great, I'm interested in the Ryobi. Can you hold it for me?", hoursAgo: 3 },
    ],
  },
  {
    phone: "5215612340002",
    name: "Carlos Ramirez",
    stage: "In conversation",
    thread: [
      { dir: "in", text: "Hi, how much is a bag of gray cement?", hoursAgo: 8 },
      { dir: "out", text: "Hi Carlos! The 94 lb bag is $14. For 10 or more it's $13 each.", hoursAgo: 8, ai: true },
      { dir: "in", text: "I need 15 bags, do you deliver to Arlington?", hoursAgo: 7 },
      { dir: "out", text: "Yes, we deliver throughout the area. Delivery is $25 and arrives the same day if you confirm before 1 pm. Total: 15 × $13 + $25 = $220.", hoursAgo: 7, ai: true },
    ],
  },
  {
    phone: "5215612340003",
    name: "Lupe Hernandez",
    stage: "Customer",
    notes: "Repeat buyer for her woodworking shop.",
    thread: [
      { dir: "in", text: "Hi again, I ran out of varnish 😅", hoursAgo: 30 },
      { dir: "out", text: "Hi Lupe! We're holding 2 quarts of the marine varnish you always get: $38. Should I send them with your sandpaper order?", hoursAgo: 30, ai: true },
      { dir: "in", text: "Yes please, put it all in one delivery", hoursAgo: 29 },
      { dir: "out", text: "Done, it ships today. Total: $52 with the sandpaper. Thanks for your purchase!", hoursAgo: 29, ai: true },
    ],
  },
  {
    phone: "5215612340004",
    name: "George Castillo",
    stage: "New",
    thread: [
      { dir: "in", text: "yo, u got white latex paint in 5 gal?", hoursAgo: 2 },
      { dir: "out", text: "Hey George! Yes: the 5-gallon bucket of white latex is $139 (covers ~1,000 sq ft). Do you want it flat or satin?", hoursAgo: 2, ai: true },
    ],
  },
  {
    phone: "5215612340005",
    name: "Ana Torres",
    stage: "Interested",
    thread: [
      { dir: "in", text: "Hi, I saw your ad. Do you carry electrical supplies?", hoursAgo: 12 },
      { dir: "out", text: "Hi Ana! Yes: wire, outlets, breakers and load centers. What do you need for your project?", hoursAgo: 12, ai: true },
      { dir: "in", text: "I need 250 ft of 12-gauge wire and 10 duplex outlets", hoursAgo: 11 },
      { dir: "out", text: "Here's a quote: 250 ft roll of 12-gauge THHN $95 + 10 duplex outlets at $3 each = $125. Should I get it ready?", hoursAgo: 11, ai: true },
      { dir: "in", text: "Let me check with the electrician and I'll let you know", hoursAgo: 10 },
    ],
  },
  {
    phone: "5215612340006",
    name: "Robert Mendoza",
    stage: "Lost",
    notes: "Was looking for a wholesale price we can't match.",
    thread: [
      { dir: "in", text: "How much per ton of 3/8 rebar?", hoursAgo: 96 },
      { dir: "out", text: "Hi Robert: a ton of 3/8 rebar is $1,050. When do you need it?", hoursAgo: 96, ai: true },
      { dir: "in", text: "Oh no, somewhere else they give it to me for 950", hoursAgo: 95 },
      { dir: "out", text: "I understand. We can't match that price, but if your supplier falls through we're here with same-day delivery. Good luck with the project!", hoursAgo: 95, ai: true },
    ],
  },
  {
    phone: "5215612340007",
    name: "Patty Dominguez",
    stage: "In conversation",
    thread: [
      { dir: "in", text: "Hi, do you have roof sealant? My roof is leaking 😩", hoursAgo: 26 },
      { dir: "out", text: "Hi Patty! Sure: the 5-year acrylic roof coating (5-gallon bucket) is $119 and covers ~400 sq ft. How big is your roof?", hoursAgo: 26, ai: true },
      { dir: "in", text: "About 600 square feet, would two be enough?", hoursAgo: 25 },
    ],
  },
  {
    phone: "5215612340008",
    name: "Mr. Jesse Aguilar",
    stage: "Customer",
    thread: [
      { dir: "in", text: "Hey, send me the usual list for the crew", hoursAgo: 50 },
      { dir: "out", text: "Happy to, Mr. Aguilar! Your usual order: 5 bags of cement, 2 of mortar, 1 roll of tie wire and 5 lb of nails. Total: $98. Should we send it to the job site on Main St?", hoursAgo: 50, ai: true },
      { dir: "in", text: "Yep, same place. Pay on delivery as usual", hoursAgo: 49 },
      { dir: "out", text: "Perfect, it goes out on the 4 o'clock truck. Thanks, Mr. Aguilar!", hoursAgo: 49, ai: true },
    ],
  },
];

const DEMO_KB: { kind: "qa" | "block"; question?: string; answer?: string; content?: string }[] = [
  {
    kind: "block",
    content:
      "Main Street Hardware — a family hardware store with 20 years downtown. We sell hand and power tools, building materials, paint, plumbing and electrical supplies. We serve the general public, contractors and workshops.",
  },
  { kind: "qa", question: "What are your hours?", answer: "Monday to Saturday from 8:00 AM to 7:00 PM and Sundays from 9:00 AM to 2:00 PM." },
  { kind: "qa", question: "Where are you located?", answer: "245 Main Street, downtown. There's free customer parking on the side street." },
  { kind: "qa", question: "Do you deliver?", answer: "Yes: same-day delivery in the area if you confirm before 1 pm. Local delivery $25; free on orders over $300." },
  { kind: "qa", question: "What payment methods do you accept?", answer: "Cash, card (credit/debit), bank transfer and pay on delivery for local orders." },
  { kind: "qa", question: "Do you provide invoices?", answer: "Yes, we invoice the same day. Send us your business details and the purchase receipt." },
  { kind: "qa", question: "Do you have bulk pricing?", answer: "Yes: cement, mortar and rebar have special pricing from 10 units; paint from 5 buckets. Ask for your quote on WhatsApp." },
  { kind: "qa", question: "Which tool brands do you carry?", answer: "Ryobi, Husky, DeWalt, Makita and Milwaukee for power tools; Leviton and Eaton for electrical; Sherwin-Williams and Behr for paint." },
  // HUECO INTENCIONAL: nada sobre garantías ni devoluciones (lo encuentra el Laboratorio).
];

export async function seedDemo(
  db: Db,
  organizationId: string
): Promise<{ contacts: number; kbEntries: number }> {
  const demoPhones = DEMO_CONTACTS.map((c) => c.phone);

  // --- Idempotencia: limpiar datos demo previos (orden inverso de FKs) ---
  const prevContacts = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(inArray(schema.contact.phone, demoPhones));
  const prevIds = prevContacts.map((c) => c.id);
  if (prevIds.length > 0) {
    const prevConvs = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(inArray(schema.conversation.contactId, prevIds));
    const convIds = prevConvs.map((c) => c.id);
    if (convIds.length > 0) {
      await db
        .delete(schema.message)
        .where(inArray(schema.message.conversationId, convIds));
      await db
        .delete(schema.conversation)
        .where(inArray(schema.conversation.id, convIds));
    }
    await db.delete(schema.lead).where(inArray(schema.lead.contactId, prevIds));
    await db.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
  }
  // KB y corridas demo previas
  await db
    .delete(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId));
  await db
    .delete(schema.agentTestCase)
    .where(eq(schema.agentTestCase.organizationId, organizationId));
  await db
    .delete(schema.agentTestRun)
    .where(eq(schema.agentTestRun.organizationId, organizationId));

  // --- Etapas (por nombre) ---
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId));
  const stageByName = new Map(stages.map((s) => [s.name, s.id]));
  const fallbackStage = stages[0]?.id;
  if (!fallbackStage) throw new Error("The organization has no stages");

  // --- Contactos + conversaciones + mensajes + leads ---
  const now = Date.now();
  let position = 0;
  for (const demo of DEMO_CONTACTS) {
    const contactId = newId("contact");
    await db.insert(schema.contact).values({
      id: contactId,
      organizationId,
      phone: demo.phone,
      waIdentity: demo.phone,
      name: demo.name,
      notes: demo.notes ?? null,
    });

    const lastInbound = demo.thread
      .filter((t) => t.dir === "in")
      .reduce((min, t) => Math.min(min, t.hoursAgo), Infinity);
    const lastMessage = demo.thread.reduce(
      (min, t) => Math.min(min, t.hoursAgo),
      Infinity
    );

    const conversationId = newId("conversation");
    await db.insert(schema.conversation).values({
      id: conversationId,
      organizationId,
      contactId,
      lastInboundAt: new Date(now - lastInbound * HOURS),
      lastMessageAt: new Date(now - lastMessage * HOURS),
      unreadCount: demo.thread[demo.thread.length - 1]?.dir === "in" ? 1 : 0,
    });

    for (const msg of demo.thread) {
      const at = new Date(now - msg.hoursAgo * HOURS);
      await db.insert(schema.message).values({
        id: newId("message"),
        organizationId,
        conversationId,
        waMessageId: `wamid.demo.${newId("message")}`,
        direction: msg.dir,
        type: "text",
        text: msg.text,
        status: msg.dir === "in" ? "delivered" : "read",
        aiGenerated: msg.ai ?? false,
        origin: msg.ai ? "ai" : "operator",
        waTimestamp: at,
        createdAt: at,
      });
    }

    await db.insert(schema.lead).values({
      id: newId("lead"),
      organizationId,
      contactId,
      stageId: stageByName.get(demo.stage) ?? fallbackStage,
      position: position++,
      lastActivityAt: new Date(now - lastMessage * HOURS),
    });
  }

  // --- Knowledge base (con el hueco intencional) ---
  for (const entry of DEMO_KB) {
    await db.insert(schema.kbEntry).values({
      id: newId("kbEntry"),
      organizationId,
      kind: entry.kind,
      question: entry.question ?? null,
      answer: entry.answer ?? null,
      content: entry.content ?? null,
    });
  }

  // --- Comportamiento del agente de la demo ---
  await db
    .update(schema.agentProfile)
    .set({
      name: "Hammy",
      tone: "Friendly and practical, like a trusted neighborhood hardware store. Casual with customers.",
      instructions:
        "Helps quote and close sales. Gives prices in USD only if they're in the knowledge. If they ask for bulk, mention the minimums. Never make up stock.",
      escalationRules:
        "Escalate to a human if they ask for an invoice with complex tax details, if there's a complaint about a damaged product, or if they explicitly ask.",
      greeting: "Hi! I'm Hammy, the assistant at Main Street Hardware 🔨",
      updatedAt: new Date(),
    })
    .where(eq(schema.agentProfile.organizationId, organizationId));

  // --- Corrida de Laboratorio de ejemplo (guardada, con el hueco encontrado) ---
  const runId = newId("testRun");
  await db.insert(schema.agentTestRun).values({
    id: runId,
    organizationId,
    status: "done",
    score: 83,
    startedAt: new Date(now - 24 * HOURS),
    finishedAt: new Date(now - 24 * HOURS + 3 * 60 * 1000),
  });
  const exampleCases: {
    persona: string;
    veredicto: "verde" | "amarillo" | "rojo";
    hallazgos: unknown[];
    transcript: { role: string; text: string }[];
  }[] = [
    {
      persona: "comprador_decidido",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Do you have cordless drills available?" },
        { role: "agente", text: "Yes! Ryobi 18V at $99 and DeWalt 20V MAX at $179." },
        { role: "cliente", text: "Sold, I'll take it. How do I pay?" },
        { role: "agente", text: "We accept cash, card, bank transfer or pay on delivery. I'll hold it for you right now." },
      ],
    },
    {
      persona: "pregunton_precios",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "How much is the hammer?" },
        { role: "agente", text: "We have several; the most popular is the Estwing claw hammer. Should I confirm price and stock with the team?" },
      ],
    },
    {
      persona: "cliente_enojado",
      veredicto: "amarillo",
      hallazgos: [
        {
          tipo: "tono",
          evidencia:
            "The agent answered correctly but a bit coldly to 'it's junk'; it needed to empathize before escalating.",
        },
      ],
      transcript: [
        { role: "cliente", text: "I bought a sander last week and it won't turn on anymore, it's junk" },
        { role: "agente", text: "Sorry about the problem. I'm passing your case to a teammate to resolve it." },
      ],
    },
    {
      persona: "fuera_de_kb",
      veredicto: "rojo",
      hallazgos: [
        {
          tipo: "fuera_de_kb",
          evidencia:
            "The customer asked about warranties and returns and the knowledge doesn't cover it.",
          sugerencia: {
            pregunta: "What's the warranty and return policy?",
            respuesta:
              "We accept returns within 30 days with a receipt; the warranty depends on the manufacturer.",
          },
        },
      ],
      transcript: [
        { role: "cliente", text: "What's your warranty and return policy?" },
        { role: "agente", text: "Let me confirm with the team and I'll get back to you in a moment." },
      ],
    },
    {
      persona: "pide_humano",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "I'd rather be helped by a person, I want to talk to a human" },
        { role: "agente", text: "(handoff: the conversation went to human handling)" },
      ],
    },
    {
      persona: "errores_modismos",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "yo u guys sell paint?" },
        { role: "agente", text: "Sure! We carry Sherwin-Williams and Behr. What do you need to paint?" },
      ],
    },
  ];
  for (const c of exampleCases) {
    await db.insert(schema.agentTestCase).values({
      id: newId("testCase"),
      organizationId,
      runId,
      persona: c.persona,
      status: "done",
      veredicto: c.veredicto,
      hallazgos: c.hallazgos,
      transcript: c.transcript,
    });
  }

  // 049 — Cuatro respuestas rápidas para probar el «/» del compositor. No
  // pisa ni duplica las que el negocio ya tenga con el mismo atajo.
  await db
    .insert(schema.quickReply)
    .values(RESPUESTAS_DEMO.map((r) => ({ id: newId("quickReply"), organizationId, ...r })))
    .onConflictDoNothing({ target: [schema.quickReply.organizationId, schema.quickReply.atajo] });

  return { contacts: DEMO_CONTACTS.length, kbEntries: DEMO_KB.length };
}

/** true si la organización aún no tiene datos de dominio (para el botón). */
export async function isDomainEmpty(
  db: Db,
  organizationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(eq(schema.contact.organizationId, organizationId))
    .limit(1);
  return rows.length === 0;
}
