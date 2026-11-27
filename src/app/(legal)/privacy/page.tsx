import type { Metadata } from "next";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { legalInfo } from "@/lib/legal";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return { title: `Privacy policy · ${branding.name}` };
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="pt-2 text-lg font-semibold text-foreground">{children}</h2>
);

export default async function PrivacyPage() {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const { product, operator, contactEmail, updated } = legalInfo(branding.name);
  return (
    <article className="space-y-4 text-[15px] leading-relaxed text-text-2">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
      <p className="text-sm text-text-3">Last updated: {updated}</p>
      <p>
        {product} is a customer relationship manager run by {operator} (&quot;we&quot;, &quot;us&quot;). This policy
        explains what information the CRM handles, why, and the choices you have.
      </p>

      <H2>Information we handle</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Team accounts:</strong> name, email address and password (stored only as a secure hash) of the people
          who sign in.
        </li>
        <li>
          <strong>Customer records:</strong> contacts, messages, appointments, notes and pipeline data that customers
          send us through our website and messaging channels, or that our team enters.
        </li>
        <li>
          <strong>Technical data:</strong> error reports and basic request logs, used only to keep the service working.
        </li>
        <li>
          <strong>Google user data:</strong> only when a team member links a Google account, as described below.
        </li>
      </ul>

      <H2>Google user data</H2>
      <p>
        The owner of the CRM can link one or more Google accounts in Settings → Calendar. The CRM then asks Google for
        the account&apos;s email address and for permission to see and edit its calendar events
        (<code>calendar.events</code>). This access is used only for these features, which the person linking the
        account turns on or off for each calendar:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Email address:</strong> to show which Google account is linked.
        </li>
        <li>
          <strong>Copying appointments:</strong> appointments booked in the CRM are created in the chosen Google
          calendars, and updated or deleted there when they change in the CRM. These events contain the appointment
          time, the customer&apos;s name, phone and address, and notes.
        </li>
        <li>
          <strong>Avoiding double bookings:</strong> the CRM reads the start and end times of events in the linked
          calendars so customers are only offered free times.
        </li>
        <li>
          <strong>Showing events:</strong> the CRM shows the title, time and link of the linked calendars&apos; events
          on the CRM calendar, read-only, to signed-in team members.
        </li>
      </ul>
      <p>
        <strong>Storage:</strong> we store the Google refresh token encrypted (AES-256-GCM) and the account&apos;s email
        address. Calendar events read from Google are not stored; they are kept in memory for at most one minute to
        avoid asking Google repeatedly.
      </p>
      <p>
        <strong>Sharing:</strong> Google user data is not sold, not used for advertising, and not shared with anyone,
        except our hosting and database providers, who process it only to run the CRM. It is never sent to AI
        providers, and it is not used to develop, improve or train AI or machine-learning models. Only free time
        slots, never event details, are used when the CRM or its booking assistant offers appointment times.
      </p>
      <p>
        {product}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a
          className="underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        <strong>Removing access:</strong> click Remove next to the account in Settings → Calendar. We then revoke our
        access with Google and delete the stored token. Appointments already copied stay in the Google calendar unless
        you delete them. You can also remove access at any time from your{" "}
        <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google account permissions
        </a>
        .
      </p>

      <H2>How we use information</H2>
      <p>
        To answer customers, schedule and manage appointments, follow up on quotes, and run the features our team turns
        on, such as automatic replies by an AI assistant to customer messages. We do not sell personal information and
        do not use it for advertising.
      </p>

      <H2>Service providers</H2>
      <p>
        We share information only with providers that help us run the CRM, and only for that purpose: Vercel (hosting),
        Neon (database), Meta (WhatsApp, Instagram and Messenger messages), Google (calendar sync, when linked), and the
        AI provider our team configures for automatic replies (customer messages only, never Google user data). We may
        also disclose information if required by law.
      </p>

      <H2>Cookies</H2>
      <p>The CRM uses only the cookies needed to keep you signed in and to complete a Google sign-in safely.</p>

      <H2>Retention and deletion</H2>
      <p>
        We keep records while they are needed to serve customers. You can ask us to access, correct or delete your
        information at any time; Google tokens are deleted as soon as an account is unlinked.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about this policy or your data:{" "}
        {contactEmail ? (
          <a className="underline" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        ) : (
          operator
        )}
        .
      </p>
    </article>
  );
}
