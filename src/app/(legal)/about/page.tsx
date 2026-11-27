import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { legalInfo } from "@/lib/legal";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return { title: `About · ${branding.name}` };
}

/** The app's public homepage: what it is and how it uses Google Calendar. */
export default async function AboutPage() {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const { product, operator } = legalInfo(branding.name);
  return (
    <article className="space-y-6 text-[15px] leading-relaxed text-text-2">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{product}</h1>
      <p className="text-lg">
        {product} is the private customer relationship manager used by {operator} to answer customers, follow up on
        quotes and book appointments in one place.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">What it does</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>One inbox for messages from WhatsApp, Instagram, Facebook Messenger, SMS, email and the website form.</li>
          <li>Contacts and a sales pipeline for every lead and customer.</li>
          <li>An appointment calendar for inspections and calls, with online booking.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Google Calendar</h2>
        <p>
          The owner of the CRM can link one or more Google accounts in Settings → Calendar. With that permission, the CRM
          copies its appointments into the chosen Google calendars and keeps them up to date, checks those calendars
          so nobody is booked at a time that&apos;s already taken, and shows their events on the CRM calendar. Access
          can be removed at any time from the CRM or from the Google account. Details are in the{" "}
          <Link href="/privacy" className="font-medium text-foreground underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
      <p>
        {product} is for {operator}&apos;s team:{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          sign in
        </Link>
        .
      </p>
    </article>
  );
}
