"use client";

import type { BotBlockDto } from "@/lib/analytics";
import { BarChart } from "./bar-chart";
import { Rate, Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";

/**
 * 019 — El trabajo del agente: si contesta, qué tan rápido, cuándo pasa a un
 * humano y —con la agenda encendida— cómo salen las citas. Todo sobre las
 * conversaciones que empezaron en el periodo, sin las del Laboratorio.
 */
export function BotSection({
  data,
  loading,
  error,
  agenda,
}: {
  data: BotBlockDto | null;
  loading: boolean;
  error: string | null;
  /** 015 — Sin la bandera AGENDA no se habla de citas en ningún lado. */
  agenda: boolean;
}) {
  return (
    <Section
      id="agente"
      title="The agent"
      hint={
        agenda
          ? "Whether it answers, how fast, when it hands off to a human and how appointments turn out."
          : "Whether it answers, how fast and when it hands the conversation to a human."
      }
      loading={loading}
      error={error}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText="No conversations in this period yet."
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatCard label="New conversations" value={String(data.conversations)} />
            <RateCard
              label="Agent answered"
              rate={data.aiReplyRate}
              unit="with a customer message"
            />
            <StatCard
              label="First response"
              value={
                data.firstResponseSeconds === null
                  ? "—"
                  : formatSegundos(data.firstResponseSeconds)
              }
              hint={
                data.firstResponseSample === 0
                  ? "the agent hasn't answered anyone yet"
                  : `median of ${data.firstResponseSample} conversations`
              }
            />
            <RateCard
              label="Handed to a human"
              rate={data.handoffRate}
              unit="conversations"
            />
          </div>

          {agenda && data.sessions && (
            <div>
              <Subhead>Appointments in the period</Subhead>
              {data.sessions.booked === 0 ? (
                <p className="text-sm text-text-3">No appointments fall in this period.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
                  <StatCard
                    label="Appointments"
                    value={String(data.sessions.booked)}
                    hint={pendientes(data.sessions)}
                  />
                  <StatCard label="Completed" value={String(data.sessions.done)} />
                  <StatCard label="No-shows" value={String(data.sessions.noShow)} />
                  <StatCard label="Canceled" value={String(data.sessions.cancelled)} />
                  <RateCard
                    label="Attendance"
                    rate={data.sessions.showRate}
                    unit="with an outcome"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Subhead>Why it went to a human</Subhead>
              <BarChart
                items={data.handoffs}
                emptyText="No conversation in the period went to a human."
              />
            </div>

            <div>
              <Subhead>Lead profile</Subhead>
              {data.fichaCoverage === null ? (
                // `null` NO es 0 %: es que el agente de esta instancia no escribe
                // ficha. Enseñar 0 % sería acusarlo de no hacer algo que nunca se
                // le pidió.
                <p className="text-sm text-text-3">
                  Nobody is filling in lead profiles. An external brain writes it (<code className="font-mono text-xs">PUT /api/bot/ficha</code>) or your team from the conversation panel.
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    <Rate rate={data.fichaCoverage} unit="new contacts" />
                  </p>
                  <p className="mt-1 text-xs text-text-3">
                    Of the contacts who arrived in this period, how many it got details from.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Las citas del periodo que todavía no tienen desenlace (siguen agendadas). */
function pendientes(s: NonNullable<BotBlockDto["sessions"]>): string | undefined {
  const n = s.booked - s.done - s.noShow - s.cancelled;
  if (n <= 0) return undefined;
  return n === 1 ? "1 without an outcome yet" : `${n} without an outcome yet`;
}

/** Segundos en algo que se lee de un vistazo. */
export function formatSegundos(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round((s / 3600) * 10) / 10} h`;
}
