/**
 * Borra SOLO la demo de Ferretería El Martillo.
 *
 * No corre solo. Hay que pedirlo:
 *   CONFIRM=delete-demo-data node --env-file=.env scripts/cleanup-demo.mjs
 *
 * No lo apuntes a producción hasta que Daniel lo revise. No hace DELETE FROM
 * contact: solo los teléfonos de la demo, las respuestas rápidas con el texto
 * exacto de la demo, las entradas de conocimiento que dicen Ferretería El
 * Martillo o Martillito, y el perfil del agente si todavía se llama Martillito.
 */
import postgres from "postgres";

const PHONES = [
  "5215612340001",
  "5215612340002",
  "5215612340003",
  "5215612340004",
  "5215612340005",
  "5215612340006",
  "5215612340007",
  "5215612340008",
];

const QUICK_REPLIES = [
  ["hola", "¡Hola {nombre}! Gracias por escribir. ¿En qué te ayudo?"],
  ["horario", "Abrimos de lunes a sábado de 8:00 a 19:00, y domingo de 9:00 a 14:00."],
  ["envio", "Hacemos envíos en la ciudad el mismo día si pides antes de las 14:00. Fuera de la ciudad, de 2 a 4 días."],
  ["pago", "Aceptamos transferencia, tarjeta y efectivo en tienda. Te paso los datos de la cuenta si quieres pagar por transferencia."],
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. This script did not connect.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const confirm = process.env.CONFIRM === "delete-demo-data";

const contacts = await sql`
  select id, name, phone from contact where phone in ${sql(PHONES)}
`;
const replies = await sql`
  select id, atajo from quick_reply
  where (atajo, texto) in ${sql(QUICK_REPLIES)}
`;
const kb = await sql`
  select id from kb_entry
  where content ilike '%Ferretería El Martillo%'
     or content ilike '%Martillito%'
     or question in (
       '¿Cuál es el horario?',
       '¿Dónde están ubicados?',
       '¿Hacen envíos a domicilio?',
       '¿Qué métodos de pago aceptan?',
       '¿Dan factura?',
       '¿Tienen precios de mayoreo?',
       '¿Qué marcas de herramienta manejan?'
     )
`;
const agents = await sql`
  select id, name from agent_profile where name = 'Martillito'
`;

console.log(
  JSON.stringify(
    {
      mode: confirm ? "delete" : "dry-run",
      demoContacts: contacts.length,
      demoQuickReplies: replies.length,
      demoKnowledge: kb.length,
      martillitoProfiles: agents.length,
    },
    null,
    2
  )
);

if (!confirm) {
  console.log("Dry run only. Set CONFIRM=delete-demo-data to delete these rows.");
  await sql.end();
  process.exit(0);
}

if (contacts.length > 0) {
  const ids = contacts.map((row) => row.id);
  await sql`delete from contact where id in ${sql(ids)}`;
}
if (replies.length > 0) {
  await sql`delete from quick_reply where id in ${sql(replies.map((row) => row.id))}`;
}
if (kb.length > 0) {
  await sql`delete from kb_entry where id in ${sql(kb.map((row) => row.id))}`;
}
if (agents.length > 0) {
  await sql`
    update agent_profile
    set name = 'Assistant',
        greeting = null,
        instructions = null
    where name = 'Martillito'
  `;
}

console.log("Deleted the demo rows listed above. Pipeline stages and other contacts were left in place.");
await sql.end();
