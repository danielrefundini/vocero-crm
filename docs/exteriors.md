# Exteriors fields, website intake, visits, SMS, and email

This fork adds home-exterior fields and two follow-up channels. Migrations are files in `drizzle/`. Nothing here runs them against production. Apply them yourself on a copy or preview database first:

```bash
pnpm db:migrate
```

On Vercel/Neon, run the new SQL in `drizzle/0027_*.sql` (the file generated with this change) against a branch of the database, then production only after review. Do not reset pipeline stages. The live stages (New, Contacted, Consult booked, Quoted, Won, Lost) are already in the database and are not rewritten.

## New columns

- `contact.email`, `address_street`, `address_city`, `address_state`, `address_zip`, `services` (jsonb array)
- `lead.quote_date`, `lead.brand` (`daniel_exteriors` or `presidential_exteriors`)
- `booking.property_address`
- New calendar rows default to `America/New_York`. Existing rows keep their timezone. Set Settings → Calendar to `America/New_York` if an older row is still `America/Mexico_City`.
- New organizations default to USD. An existing brand currency is not overwritten. Set Settings → Brand to USD so Results includes quote amounts.

Quote amount is `lead.amount_cents`. Empty is `NULL`, not `0`.

## Website form

`POST {APP_BASE_URL}/api/intake/website`

Header: `Authorization: Bearer <WEBSITE_FORM_TOKEN>` or `X-Website-Form-Token`.

```json
{
  "name": "Jordan Lee",
  "email": "jordan@example.com",
  "phone": "2025550147",
  "service": "Windows and Gutters",
  "message": "Ranch house in Rockville",
  "city": "Rockville",
  "state": "MD",
  "zip": "20850",
  "formId": "daniel-exteriors"
}
```

`service` may be a string or a list. Unknown values are stored in notes as `[Unrecognized service] …` and do not fail the request. A phone becomes an SMS thread (`sms:` + US number with country code 1). Email only becomes an email thread. The lead source stored is `organico` (shown as Organic / website). Brand defaults to Daniel Exteriors.

`WEBSITE_FORMS` is optional. A JSON array of form ids or origins, or a comma-separated list. If it is set, `formId` or the `Origin` header must match. If the value is not a list, intake returns 403 instead of accepting everything.

## SMS and email

See `.env.example`. If the Twilio or Resend variables are missing, those webhooks return 404 and the rest of the app still boots. Settings → Website, SMS & email shows status, not secrets.

Webhooks:

- `POST {APP_BASE_URL}/api/webhooks/sms/inbound` — Twilio, `X-Twilio-Signature`. The URL in Twilio must be this exact URL (APP_BASE_URL + path).
- `POST {APP_BASE_URL}/api/webhooks/email/inbound` — Resend `email.received`, Svix headers, `RESEND_WEBHOOK_SECRET`.

WhatsApp's 24-hour template rule is unchanged. SMS and email have no service window.

## In-home visits

Settings → Calendar → In-home visit. Book from Appointments (New visit) or `POST /api/bookings` with `"connector": "in-home"` and `propertyAddress`. The meeting link is `https://www.google.com/maps/search/?api=1&query=...`. A visit with no address is still saved and the panel says the map link is missing.

Travel time uses the existing buffer (0–120 minutes), labeled “Travel buffer between appointments”.

## Demo data

`pnpm seed:demo` and the old “Load demo data” button do not insert the hardware store. To remove rows already loaded:

```bash
CONFIRM=delete-demo-data node --env-file=.env scripts/cleanup-demo.mjs
```

Without `CONFIRM` it only prints counts. It deletes contacts whose phone is `5215612340001`–`0008`, the four demo quick replies by exact text, knowledge entries that are the Ferretería / Martillito sample, and an agent profile named Martillito. It does not delete other contacts or stage history.

Optional, only if stage names are still the Spanish defaults:

```bash
CONFIRM=rename-spanish-stages node --env-file=.env scripts/rename-pipeline-stages.mjs
```
