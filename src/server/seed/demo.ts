import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";

/**
 * La demo de la ferretería no se siembra en este fork. El botón y el script
 * siguen existiendo para no romper el comando, pero no escriben nada.
 */

type Db = ReturnType<typeof getDb>;

export const DEMO_DISABLED = true;

export async function seedDemo(
  _db: Db,
  _organizationId: string
): Promise<{ seeded: false; reason: "demo_disabled" }> {
  return { seeded: false, reason: "demo_disabled" };
}

export async function isDomainEmpty(db: Db, organizationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(eq(schema.contact.organizationId, organizationId))
    .limit(1);
  return rows.length === 0;
}
