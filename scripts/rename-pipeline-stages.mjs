/**
 * Renombra las etapas sembradas en español, solo si el nombre coincide
 * exactamente. No borra etapas, no toca kind, no toca la bitácora.
 *
 * La organización de producción ya está en New / Contacted / Consult booked /
 * Quoted / Won / Lost: este script no cambia esas filas.
 *
 *   CONFIRM=rename-spanish-stages node --env-file=.env scripts/rename-pipeline-stages.mjs
 *
 * No lo corras contra producción salvo que Daniel lo pida. Un despliegue no
 * lo ejecuta solo.
 */
import postgres from "postgres";

const RENAMES = [
  ["Nuevo", "New"],
  ["En conversación", "Contacted"],
  ["Interesado", "Consult booked"],
  ["Cliente", "Won"],
  ["Perdido", "Lost"],
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const confirm = process.env.CONFIRM === "rename-spanish-stages";
const found = await sql`
  select id, name, kind from pipeline_stage
  where name in ${sql(RENAMES.map((pair) => pair[0]))}
`;
console.log(JSON.stringify({ mode: confirm ? "rename" : "dry-run", matches: found }, null, 2));
if (!confirm) {
  console.log("Dry run. Set CONFIRM=rename-spanish-stages to rename these rows.");
  await sql.end();
  process.exit(0);
}
for (const [from, to] of RENAMES) {
  await sql`update pipeline_stage set name = ${to} where name = ${from}`;
}
console.log("Renamed exact Spanish stage names. Won/Lost kinds were not changed.");
await sql.end();
