import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { barrido } from "@/server/webhooks/worker";
import { tanda } from "@/server/dispatch/worker";

/**
 * For serverless hosts (Vercel), where the in-process 10-second timers don't
 * run between requests: a scheduled call that retries pending webhook events
 * and agent dispatches. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Without CRON_SECRET set, the route doesn't exist (404).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const events = await barrido();
  const dispatches = await tanda();
  return NextResponse.json({ ok: true, events, dispatches });
}
