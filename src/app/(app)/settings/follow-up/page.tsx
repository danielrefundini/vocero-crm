import type { ReactNode } from "react";
import {
  emailWebhookUrl,
  last4,
  resendConfig,
  resendOutboundConfig,
  smsWebhookUrl,
  twilioConfig,
  websiteIntakeUrl,
} from "@/server/follow-up/config";

export const dynamic = "force-dynamic";

/**
 * Estado de la web, el SMS y el correo. No muestra secretos: solo si están
 * puestos y, del número o del remitente, lo que el operador ya va a ver.
 */
export default function FollowUpSettingsPage() {
  const website = Boolean(process.env.WEBSITE_FORM_TOKEN?.trim());
  const forms = process.env.WEBSITE_FORM_ALLOWLIST?.trim();
  const twilio = twilioConfig();
  const resendOut = resendOutboundConfig();
  const resendIn = resendConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Website, SMS, and email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These channels are configured with environment variables, not in this screen. Add the keys in
          Vercel (or <code>.env</code> locally) and redeploy. Nothing on this page is a secret.
        </p>
      </header>

      <Section
        title="Website form"
        ready={website}
        readyText="Accepting form posts"
        offText="Off until WEBSITE_FORM_TOKEN is set"
      >
        <p>
          POST JSON to <Code>{websiteIntakeUrl()}</Code> with{" "}
          <Code>Authorization: Bearer &lt;WEBSITE_FORM_TOKEN&gt;</Code> or{" "}
          <Code>X-Website-Form-Token</Code>.
        </p>
        <p>Fields: name, email, phone, service (or services), message, and optional address parts, zip, formId.</p>
        <p>
          {forms
            ? "WEBSITE_FORM_ALLOWLIST is set, so only the listed form ids or origins are accepted."
            : "WEBSITE_FORM_ALLOWLIST is empty, so any form id is accepted as long as the token matches."}
        </p>
      </Section>

      <Section
        title="SMS (Twilio)"
        ready={Boolean(twilio)}
        readyText={twilio ? `Sending from ···${last4(twilio.fromNumber)}` : ""}
        offText="Off until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set"
      >
        <p>
          Inbound webhook (POST, Twilio signature): <Code>{smsWebhookUrl()}</Code>
        </p>
        <p>Point that URL at this app in the Twilio console. It must match APP_BASE_URL exactly.</p>
      </Section>

      <Section
        title="Email (Resend)"
        ready={Boolean(resendOut)}
        readyText={resendOut ? `From ${resendOut.fromEmail}` : ""}
        offText="Off until RESEND_API_KEY and RESEND_FROM_EMAIL are set"
      >
        <p>
          Inbound webhook: <Code>{emailWebhookUrl()}</Code>
          {resendIn ? " (signing secret is set)" : " — also set RESEND_WEBHOOK_SECRET or inbound mail stays off"}
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  ready,
  readyText,
  offText,
  children,
}: {
  title: string;
  ready: boolean;
  readyText: string;
  offText: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        <span className={ready ? "text-xs text-brand-text" : "text-xs text-muted-foreground"}>
          {ready ? readyText : "Not configured"}
        </span>
      </div>
      {!ready && <p className="mb-2 text-sm text-muted-foreground">{offText}</p>}
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-subtle px-1 py-0.5 text-xs text-foreground">{children}</code>;
}
