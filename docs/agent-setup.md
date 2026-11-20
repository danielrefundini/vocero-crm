# Turn on the agent (Nea) on this Vercel + Neon deploy

Vocero 2.7.0 does not reply by itself. An external brain replies. The supported one is [Nea](https://github.com/kevinrivm/nea-agent) (MIT). This CRM already has a Claude model in Settings → AI. Nea should use that, not a second paid key.

Do this in the dashboards. Do not paste keys into chat.

## 1. Host Nea somewhere that stays running

This CRM is a Next.js app on Vercel. There is no Docker network named `nea`. Nea has to be its own service. Fly, Railway, and Render are the hosts Vocero already documents (`fly.toml`, `railway.toml`, `render.yaml`).

Image: `ghcr.io/kevinrivm/nea-agent`. `docs/migrar-a-2.0.md` shows tag `2.0.0`. Comments in `fly.toml` mention `2.0.2`. Before you pin a tag, open the registry or the Nea repo's releases and use a current 2.x tag you can see. Do not invent one.

Give that service a public HTTPS URL.

## 2. Environment on Nea

| Name | Value |
|---|---|
| `CRM_BASE_URL` | `https://vocero-crm-nine.vercel.app` (or the custom domain, if you add one) |
| `CRM_BOT_API_KEY` | the same value as the CRM's `BOT_API_KEY` (already set on the Vercel project; at least 16 characters) |
| `DATABASE_URL` | the same Neon database |
| `DATABASE_SCHEMA` | `nea` |
| `LLM_API_KEY` | leave empty |

Empty `LLM_API_KEY` is the simple path. Nea then thinks through `POST /api/bot/llm/...` with the Claude model already saved in Settings → AI. The key never leaves the CRM. Do not add `OPENROUTER_API_TOKEN` on Vercel unless you decide you want a second key.

## 3. Environment on the CRM (Vercel project `vocero-crm`)

| Name | Value |
|---|---|
| `BRAIN_DISPATCH_URL` | `https://<nea-host>/vocero/dispatch` |
| `BRAIN_HEALTH_URL` | `https://<nea-host>/health` |

`BOT_API_KEY` is already set. Do not rotate it. Nea must use that same secret.

Adding variables in Vercel does not reload a running deployment. Redeploy the CRM after you save `BRAIN_DISPATCH_URL` and `BRAIN_HEALTH_URL`.

WhatsApp, Instagram, and the website form keep posting to the CRM. Do not point Meta or Zernio webhooks at Nea.

## 4. Turn it on

1. Open Agent. “Who replies to your customers” should show the brain healthy.
2. If dispatch is unset, the card stays a manual inbox and says what is missing. The rest of the CRM still works.
3. Load the knowledge base from `knowledge-base-draft.md` if you have it. Leave every `[NEEDS DANIEL]` line blank. Do not invent prices, warranties, or financing.
4. Turn the Agent switch on. The switch refuses to turn on unless dispatch is configured and `/health` is healthy (`409 sin_cerebro`).

## If it stays a manual inbox

That is a valid mode. Check, in order: Nea is reachable over HTTPS, `BRAIN_DISPATCH_URL` has no username or password in it, `BOT_API_KEY` matches on both sides, and the CRM was redeployed after the variables were saved.
