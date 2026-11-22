import Link from "next/link";
import { C, Code, GuidePage, GuideSection, Note } from "@/components/guides/guide-page";

export const metadata = { title: "Set up your calendar" };

const linkCls = "underline underline-offset-2";

/** How-to: business hours, openings and how each meeting is delivered. */
export default function CalendarGuide() {
  return (
    <GuidePage
      kicker="Guide"
      title="Set up your calendar"
      intro={
        <p>
          The calendar decides <strong>when</strong> customers can book with you. Your agent offers those openings in the
          chat, and every booking shows up in{" "}
          <Link href="/bookings" className={linkCls}>Appointments</Link>. Everything below is done in{" "}
          <Link href="/settings/calendar" className={linkCls}>Settings → Scheduling</Link>; changes save on their own.
        </p>
      }
    >
      <GuideSection n={1} title="Set your business hours">
        <p>
          Under <strong>Business hours</strong>, add the time ranges you take appointments for each day of the week. A
          day can have more than one range (for example 8:00–12:00 and 13:00–17:00 to leave lunch free). Days with no
          range are shown as <strong>Closed</strong> and never get openings.
        </p>
      </GuideSection>

      <GuideSection n={2} title="Decide how openings are generated">
        <p>The CRM turns your hours into bookable openings using these rules:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Appointment length</strong>: how long each appointment lasts, in minutes. An inspection that takes an
            hour should be 60.
          </li>
          <li>
            <strong>Buffer between appointments</strong>: free minutes kept after each one, for driving between jobs or
            writing notes.
          </li>
          <li>
            <strong>Minimum notice</strong>: how many hours ahead a customer has to book. With 24, nobody can grab a slot
            for later today.
          </li>
          <li>
            <strong>Booking window</strong>: how many days into the future openings are offered.
          </li>
          <li>
            <strong>Time zone</strong>: the zone your hours are in, as a name like <C>America/New_York</C> (Eastern) or{" "}
            <C>America/Chicago</C> (Central). Customers are always offered times in this zone, so check it first.
          </li>
        </ul>
        <p>
          The <strong>Upcoming openings</strong> panel at the bottom of the page shows the result right away, so you can
          tweak a setting and see what customers will be offered.
        </p>
      </GuideSection>

      <GuideSection n={3} title="Choose how the meeting is delivered">
        <p>
          Pick one option under <strong>How the meeting is delivered</strong>. Whatever you pick, a problem with an
          outside service never loses a booking (see the last section).
        </p>

        <h3 className="pt-1 font-semibold text-foreground">Fixed link (default, nothing to connect)</h3>
        <p>
          Paste your usual meeting room link once in <strong>Your usual room</strong> (a Zoom personal room, a Meet link,
          anything) and every appointment shares it. <strong>For in-person visits, such as home inspections, leave it
          empty</strong>: appointments are booked with no link, and the address is collected in the chat.
        </p>

        <h3 className="pt-1 font-semibold text-foreground">Zoom</h3>
        <p>Each appointment gets its own Zoom meeting. Rescheduling moves it and keeps the link; canceling deletes it.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Sign in to the{" "}
            <a href="https://marketplace.zoom.us/" target="_blank" rel="noreferrer" className={linkCls}>
              Zoom App Marketplace
            </a>{" "}
            with your business account and choose <strong>Develop → Build App → Server-to-Server OAuth</strong>.
          </li>
          <li>Give it a name and fill in the required contact info.</li>
          <li>Under Scopes, add these four:</li>
        </ol>
        <Code>{`meeting:write:meeting     create the meeting
meeting:update:meeting    move it when rescheduling
meeting:delete:meeting    delete it when canceling
user:read:user            read your user (used by the Test button)`}</Code>
        <Note tone="warn">
          The fourth one is the one people forget. Without it the <strong>Test</strong> button fails even though your
          credentials are fine.
        </Note>
        <ol start={4} className="list-decimal space-y-1.5 pl-5">
          <li>Activate the app, then copy the <strong>Account ID</strong>, <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
          <li>
            Back in <Link href="/settings/calendar" className={linkCls}>Scheduling</Link>, select Zoom, paste the three
            values and press <strong>Test</strong>. They&apos;re checked with Zoom before being saved, and stored encrypted.
          </li>
        </ol>

        <h3 className="pt-1 font-semibold text-foreground">Google Calendar + Meet</h3>
        <p>
          Each appointment becomes an event on your Google Calendar with its own Meet link, so bookings appear right where
          you already plan your day.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            In the{" "}
            <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className={linkCls}>
              Google Cloud Console
            </a>
            , create a project for your business and enable the <strong>Google Calendar API</strong>.
          </li>
          <li>
            Set up the <strong>OAuth consent screen</strong> (type External is fine) and add the scope{" "}
            <C>https://www.googleapis.com/auth/calendar.events</C>.
          </li>
          <li>
            Create an <strong>OAuth client ID</strong> of type <em>Web application</em>, and add{" "}
            <C>https://developers.google.com/oauthplayground</C> as an authorized redirect URI. Copy the{" "}
            <strong>Client ID</strong> and <strong>Client Secret</strong>.
          </li>
          <li>
            Get the refresh token: open the{" "}
            <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className={linkCls}>
              OAuth 2.0 Playground
            </a>
            , click the gear icon, tick <strong>Use your own OAuth credentials</strong> and paste your Client ID and
            Secret. Enter the <C>calendar.events</C> scope above, authorize with the Google account whose calendar you
            want to use, then click <strong>Exchange authorization code for tokens</strong> and copy the{" "}
            <strong>Refresh token</strong>.
          </li>
          <li>
            In <Link href="/settings/calendar" className={linkCls}>Scheduling</Link>, select Google Calendar + Meet,
            paste the Client ID, Client Secret and refresh token, leave Calendar as <C>primary</C> (or paste another
            calendar&apos;s ID), and press <strong>Test</strong>.
          </li>
        </ol>
        <Note tone="warn">
          <strong>Publish your OAuth app to production</strong> (OAuth consent screen → Publish app). In testing mode,
          Google revokes the refresh token after 7 days and new appointments stop getting a Meet link. If that happens,
          the CRM marks the connection as broken in Settings so you can reconnect.
        </Note>
      </GuideSection>

      <GuideSection n={4} title="Let the agent book for you">
        <p>
          With an <Link href="/guides/connect-agent" className={linkCls}>agent connected</Link>, it reads your openings,
          offers a few times in the chat, books the one the customer picks, and can reschedule or cancel it later. You can
          see and manage every booking in <Link href="/bookings" className={linkCls}>Appointments</Link>. Without an
          agent, the calendar still works for appointments your team creates.
        </p>
      </GuideSection>

      <GuideSection title="If Zoom or Google is down">
        <p>The booking is saved in the CRM first, then the CRM talks to the provider. If the provider fails:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>The appointment is still booked, just without a link for now.</li>
          <li>The customer is told the link is on its way instead of getting a link that doesn&apos;t exist.</li>
          <li>
            In <Link href="/bookings" className={linkCls}>Appointments</Link> it&apos;s marked &quot;no link&quot; with a
            button to retry.
          </li>
          <li>If the credentials were rejected, the connection is marked as broken in Settings with a reconnect card.</li>
        </ul>
        <p>
          Test conversations from the <Link href="/lab" className={linkCls}>Lab</Link> never create real meetings.
        </p>
      </GuideSection>
    </GuidePage>
  );
}
