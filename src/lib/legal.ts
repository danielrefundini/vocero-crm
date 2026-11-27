import { getEnv } from "@/lib/env";

/** Who runs this CRM and how to reach them, for the public legal pages. */
export function legalInfo(productName: string): {
  product: string;
  operator: string;
  contactEmail: string | null;
  updated: string;
} {
  const env = getEnv();
  return {
    product: productName,
    operator: env.LEGAL_OPERATOR_NAME?.trim() || productName.replace(/\s+CRM$/i, "") || productName,
    contactEmail: env.LEGAL_CONTACT_EMAIL?.trim() || null,
    updated: "November 28, 2026",
  };
}
