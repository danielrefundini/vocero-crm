import { apiError, withAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/** La demo de ferretería no se carga en este fork. */
export const POST = withAuth(async () => {
  return apiError(
    410,
    "demo_disabled",
    "Demo data is turned off. This CRM does not load the hardware-store sample."
  );
});
