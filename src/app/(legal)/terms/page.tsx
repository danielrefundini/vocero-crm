import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { legalInfo } from "@/lib/legal";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return { title: `Terms of service · ${branding.name}` };
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="pt-2 text-lg font-semibold text-foreground">{children}</h2>
);

export default async function TermsPage() {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const { product, operator, contactEmail, updated } = legalInfo(branding.name);
  return (
    <article className="space-y-4 text-[15px] leading-relaxed text-text-2">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of service</h1>
      <p className="text-sm text-text-3">Last updated: {updated}</p>
      <p>
        These terms cover the use of {product}, the CRM run by {operator}. By signing in you agree to them.
      </p>
      <H2>Who can use it</H2>
      <p>
        Access is by invitation for {operator}&apos;s team. Keep your sign-in private and tell us right away if you think
        someone else has used it.
      </p>
      <H2>Acceptable use</H2>
      <p>
        Use the CRM only for {operator}&apos;s business: talking to customers, managing leads and booking appointments.
        Don&apos;t use it to send spam, to break the law, or to try to access data you aren&apos;t allowed to see.
      </p>
      <H2>Connected accounts</H2>
      <p>
        When you link a Google account or a messaging channel, you confirm you are allowed to use it, and the CRM acts
        on it only as described in the{" "}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        . You can unlink it at any time.
      </p>
      <H2>Availability</H2>
      <p>
        We work to keep the CRM running, but it is provided as is, without guarantees that it will always be available
        or free of errors. Appointments and records are the business&apos;s responsibility to keep up to date.
      </p>
      <H2>Changes</H2>
      <p>We may update these terms; the date above shows the latest version.</p>
      <H2>Contact</H2>
      <p>
        {contactEmail ? (
          <a className="underline" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        ) : (
          operator
        )}
      </p>
    </article>
  );
}
