import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * In-app how-to pages (Help). Plain reading pages: a header, numbered
 * sections, and code the owner copies into `.env`. They replace links that
 * used to send people to the repository on GitHub.
 */
export function GuidePage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Getting started
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <div className="mt-2 text-muted-foreground">{intro}</div>
        </header>
        {children}
      </article>
    </div>
  );
}

export function GuideSection({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-4 rounded-xl border bg-card p-4 sm:p-5">
      {n !== undefined && (
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-text-2"
        >
          {n}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-text-2 [&_strong]:text-foreground">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-subtle p-3 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

export function C({ children }: { children: ReactNode }) {
  return <code className="whitespace-nowrap font-mono text-[0.92em] text-foreground">{children}</code>;
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={
        tone === "warn"
          ? "rounded-lg border border-warning-soft bg-warning-tint p-3 text-warning-text"
          : "rounded-lg border bg-subtle p-3"
      }
    >
      {children}
    </div>
  );
}
