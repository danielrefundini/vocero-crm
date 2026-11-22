"use client";

import type { SalesBlockDto } from "@/lib/analytics";
import { formatMoneyCents } from "@/lib/money";
import { Funnel } from "./funnel";
import { Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";
import { TimeBars } from "./time-bars";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** 019 — Ventas: los indicadores, la serie, el embudo y las pérdidas. */
export function SalesSection({
  data,
  loading,
  error,
  currency,
}: {
  data: SalesBlockDto | null;
  loading: boolean;
  error: string | null;
  currency: string;
}) {
  const money = (c: number | null) => formatMoneyCents(c, currency) ?? "—";
  return (
    <Section
      id="ventas"
      title="Sales"
      hint="What came in, what closed and where deals get stuck."
      loading={loading}
      error={error}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText="No leads or closes in this period. Try a wider range."
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="New leads"
              value={String(data.kpis.newLeads.current)}
              compare={data.kpis.newLeads}
            />
            <StatCard
              label="Deals won"
              value={String(data.kpis.won.current)}
              compare={data.kpis.won}
            />
            <StatCard
              label="Revenue won"
              value={money(data.kpis.wonCents.current)}
              compare={data.kpis.wonCents}
            />
            <StatCard
              label="Deals lost"
              value={String(data.kpis.lost.current)}
              compare={data.kpis.lost}
              inverted
            />
            <RateCard
              label="Close rate"
              rate={data.kpis.winRate}
              unit="closed deals"
            />
            <StatCard
              label="Average ticket"
              value={money(data.kpis.avgTicketCents)}
              hint={
                data.kpis.avgTicketCents === null
                  ? "no won deal has an amount"
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TimeBars
              title="New leads"
              unit="leads"
              points={data.series.map((s) => ({ bucket: s.bucket, value: s.newLeads }))}
              format={(v) => String(v)}
            />
            <TimeBars
              title="Deals won"
              unit="deals won"
              points={data.series.map((s) => ({
                bucket: s.bucket,
                value: s.won,
                detail: s.wonCents > 0 ? money(s.wonCents) : undefined,
              }))}
              format={(v) => String(v)}
              emptyText="No deals won in this period."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Subhead>Funnel of those who came in this period</Subhead>
              <Funnel steps={data.funnel} />
            </div>

            <div className="space-y-6">
              <div>
                <Subhead>Where they get stuck</Subhead>
                {data.timing.length === 0 ? (
                  <p className="text-sm text-text-3">
                    Not enough moves yet to measure times.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Stage</th>
                        <th scope="col">Average days</th>
                        <th scope="col">Moves measured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.timing.map((t) => (
                        <tr key={t.stageId ?? t.name} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{t.name}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {t.avgDays ?? "—"} days
                          </td>
                          <td className="w-24 py-1.5 text-right text-xs text-text-3 tabular-nums">
                            {t.sample} moves
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.timeToWinDays !== null && (
                  <p className="mt-2 text-xs text-text-3">
                    From first contact to close:{" "}
                    <strong className="font-semibold text-foreground">
                      {data.timeToWinDays} days
                    </strong>{" "}
                    on average.
                  </p>
                )}
              </div>

              <div>
                <Subhead>Why they were lost</Subhead>
                {data.lossReasons.length === 0 ? (
                  <p className="text-sm text-text-3">No deals lost in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Reason</th>
                        <th scope="col">Deals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lossReasons.map((r) => (
                        <tr key={r.reason} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{r.label}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div>
            <Subhead>Today in the funnel</Subhead>
            <p className="-mt-1 mb-2 text-xs text-text-3">
              {"Doesn't depend on the period: these are the deals open right now."}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:max-w-xl">
              <StatCard label="Money in open deals" value={money(data.pipeline.openCents)} />
              <StatCard
                label="Deals with no amount"
                value={String(data.pipeline.withoutAmount)}
                hint={data.pipeline.withoutAmount > 0 ? "don't add to open money" : undefined}
              />
            </div>
            {data.pipeline.otherCurrency > 0 && (
              <p className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-xs text-warning-text">
                {plural(data.pipeline.otherCurrency, "deal", "deals")} with an amount in another currency {data.pipeline.otherCurrency === 1 ? "is" : "are"} not included in the totals: mixing currencies would give a false sum.
              </p>
            )}
          </div>

          {data.completeFrom && (
            <p className="text-[11px] text-text-3">
              Times use moves recorded since{" "}
              {new Date(data.completeFrom).toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {". Earlier data was seeded when the stage log was installed and isn't used to measure durations."}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
