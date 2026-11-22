import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getEnv } from "@/lib/env";
import { isChannelEnabled } from "@/server/channels/enabled";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Website form: where the site's form submissions come in. Each submission
 * becomes an unread message in the inbox with a "Website" badge. Exists only
 * with WEBSITE_FORMS=on (ADR-001).
 */
export default async function WebsiteFormSettingsPage() {
  if (!(await isChannelEnabled("website"))) notFound();
  const env = getEnv();
  const token = env.WEBSITE_FORM_TOKEN;
  const url = token ? `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/website/${token}` : null;

  const snippet = url
    ? `<script>
  // Sends every submission of the form to the CRM too.
  // Formspree keeps working exactly as before.
  document.querySelectorAll('form[action*="formspree.io"]').forEach(function (form) {
    form.addEventListener("submit", function () {
      var data = Object.fromEntries(new FormData(form));
      fetch("${url}", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true
      });
    });
  });
</script>`
    : "";

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Website form</CardTitle>
          <CardDescription>
            When someone fills out the form on your website, it shows up in the inbox as a new unread
            message with a Website badge: name, email, phone, the service they picked and their message.
            You get the same sound and alert as a chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {url ? (
            <>
              <p className="font-medium">Your form link</p>
              <code className="block break-all rounded-md border bg-subtle p-3 font-mono text-xs">{url}</code>
              <p className="text-text-2">
                Keep it private-ish: anyone with this link can add a lead to your inbox.
              </p>
            </>
          ) : (
            <p className="text-danger-text">
              Add WEBSITE_FORM_TOKEN to the .env file (any long random text) and restart the CRM to get your
              form link.
            </p>
          )}
        </CardContent>
      </Card>

      {url && (
        <Card>
          <CardHeader>
            <CardTitle>Option 1: add one snippet to your website (works on Formspree&apos;s free plan)</CardTitle>
            <CardDescription>
              Paste this right before <code>&lt;/body&gt;</code> on the page with the form. Formspree still
              gets every submission and still emails you; the CRM gets a copy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border bg-subtle p-3 font-mono text-xs">{snippet}</pre>
          </CardContent>
        </Card>
      )}

      {url && (
        <Card>
          <CardHeader>
            <CardTitle>Option 2: Formspree webhook (Formspree paid plans)</CardTitle>
            <CardDescription>No change to your website.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-2">
              <li>In Formspree, open your form → Plugins → Webhook.</li>
              <li>Paste your form link above as the webhook URL and save.</li>
              <li>
                Optional: copy the webhook&apos;s signing secret into FORMSPREE_SIGNING_SECRET in the .env file, so
                the CRM rejects anything Formspree didn&apos;t send.
              </li>
            </ol>
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-xs text-text-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          These leads can&apos;t be answered from the inbox: there&apos;s no chat behind a form. Call or email them
          with the details in the message. The AI agent doesn&apos;t reply to them either.
        </span>
      </p>
    </div>
  );
}
