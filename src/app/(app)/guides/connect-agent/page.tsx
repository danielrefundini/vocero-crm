import Link from "next/link";
import { C, Code, GuidePage, GuideSection, Note } from "@/components/guides/guide-page";

export const metadata = { title: "Connect your agent" };

/** How-to: connecting an AI agent (Nea or your own) to the CRM. */
export default function ConnectAgentGuide() {
  return (
    <GuidePage
      kicker="Guide"
      title="Connect your agent"
      intro={
        <p>
          The CRM doesn&apos;t answer customers by itself. An <strong>agent</strong> is a small separate service that
          runs next to it and writes the replies. This page explains how they fit together and how to connect one. The
          agent is optional: without one, the CRM is a shared inbox and you answer by hand.
        </p>
      }
    >
      <GuideSection title="How it works">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>A customer writes on WhatsApp, Instagram, Messenger, TikTok or Telegram. The message lands in the Inbox first.</li>
          <li>
            The CRM sends that message to your agent (a signed request to the agent&apos;s address,{" "}
            <C>BRAIN_DISPATCH_URL</C>).
          </li>
          <li>
            The agent reads the customer&apos;s history, your business profile and knowledge base from the CRM, decides what to
            say, and sends the reply back through the CRM. It thinks with the AI key you saved in{" "}
            <Link href="/settings/ai" className="underline underline-offset-2">Settings → AI</Link>, so the agent needs no AI key of
            its own.
          </li>
          <li>The reply goes out to the customer and shows in the Inbox, marked as written by the agent.</li>
        </ol>
        <p>
          Your WhatsApp token and AI key never leave the CRM: the agent only talks to the CRM, with one shared password,{" "}
          <C>BOT_API_KEY</C>.
        </p>
      </GuideSection>

      <GuideSection n={1} title="Make sure the shared password exists">
        <p>
          Open the CRM&apos;s <C>.env</C> file and look for <C>BOT_API_KEY</C>. If it&apos;s empty, set it to a long random
          value (at least 16 characters). This command prints one:
        </p>
        <Code>{`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</Code>
        <p>The agent uses the same value, so keep it at hand for the next step.</p>
      </GuideSection>

      <GuideSection n={2} title="Run the agent (Nea)">
        <p>
          <strong>Nea</strong> is the ready-made agent built for this CRM. It runs as a Docker container. With{" "}
          <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Docker Desktop
          </a>{" "}
          installed and running, start it with the values from your CRM&apos;s <C>.env</C>:
        </p>
        <Code>{`docker run -d --name nea -p 8000:8000 --restart unless-stopped \\
  -e CRM_BASE_URL=http://host.docker.internal:3002 \\
  -e CRM_BOT_API_KEY=<your BOT_API_KEY> \\
  -e DATABASE_URL=<your DATABASE_URL, with localhost changed to host.docker.internal> \\
  -e DATABASE_SCHEMA=nea \\
  ghcr.io/kevinrivm/nea-agent:2.0.1`}</Code>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <C>host.docker.internal</C> is how a container reaches your own computer. Use it instead of{" "}
            <C>localhost</C> in both addresses.
          </li>
          <li>
            Nea keeps its own tables in a separate <C>nea</C> section of the same database. It never touches the CRM&apos;s
            tables.
          </li>
          <li>
            Check it&apos;s up by opening <C>http://localhost:8000/health</C> in your browser.
          </li>
        </ul>
        <Note>
          If the CRM runs on a server instead (Coolify, Render, Fly, Railway), run Nea as a second service on the same
          private network with the same four variables, and use the CRM&apos;s internal address for{" "}
          <C>CRM_BASE_URL</C>.
        </Note>
      </GuideSection>

      <GuideSection n={3} title="Tell the CRM where the agent is">
        <p>Add these two lines to the CRM&apos;s <C>.env</C>:</p>
        <Code>{`BRAIN_DISPATCH_URL=http://localhost:8000/vocero/dispatch
BRAIN_HEALTH_URL=http://localhost:8000/health`}</Code>
        <p>
          Then restart the CRM. On a hosting platform, <strong>redeploy</strong>: a plain restart doesn&apos;t load new
          variables there.
        </p>
      </GuideSection>

      <GuideSection n={4} title="Check the connection and turn the agent on">
        <p>
          Open <Link href="/agent" className="underline underline-offset-2">Agent</Link>. The card &quot;Who answers your
          customers&quot; should now say your agent is online. Then flip the switch at the top to <strong>On</strong>.
          The switch only turns on when the CRM can reach a healthy agent; if it can&apos;t, the card says what&apos;s
          missing.
        </p>
        <p>
          From then on the agent answers new messages. Turning the switch off sends everything back to the Inbox for your
          team, and you can take over any single conversation from the Inbox at any time.
        </p>
      </GuideSection>

      <GuideSection n={5} title="Test it safely first">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            The <Link href="/lab" className="underline underline-offset-2">Lab</Link> runs simulated customers against your
            agent and grades each conversation, without sending anything real.
          </li>
          <li>
            While you try it on real WhatsApp, you can limit Nea to your own number: add{" "}
            <C>-e ALLOWED_WA_IDS=&lt;your number&gt;</C> to the <C>docker run</C> command, and it only answers you.
          </li>
          <li>
            The role, tools and knowledge the agent uses are set on the{" "}
            <Link href="/agent" className="underline underline-offset-2">Agent</Link> screen. Changes reach it within a few
            minutes, no restart needed.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Using your own agent instead of Nea">
        <p>Any service can be the agent, as long as it speaks the CRM&apos;s API:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            It receives each customer message as a POST to its <C>BRAIN_DISPATCH_URL</C>, signed with HMAC-SHA256 using{" "}
            <C>BOT_API_KEY</C>.
          </li>
          <li>
            It calls the CRM&apos;s <C>/api/bot/*</C> routes with the header <C>X-API-Key: &lt;BOT_API_KEY&gt;</C> to read
            context, reply, book appointments or hand off to a person, and <C>/api/bot/llm</C> to think with your AI key.
          </li>
          <li>
            The full contract is published by this CRM at{" "}
            <a href="/api/bot/openapi.json" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              /api/bot/openapi.json
            </a>
            .
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Not using an agent">
        <p>
          Leave <C>BRAIN_DISPATCH_URL</C> empty. Everything else works the same: messages arrive in the Inbox and your team
          answers them.
        </p>
      </GuideSection>
    </GuidePage>
  );
}
