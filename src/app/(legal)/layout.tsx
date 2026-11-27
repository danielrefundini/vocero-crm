import Link from "next/link";
import { BrandLogo } from "@/components/brand-mark";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { legalInfo } from "@/lib/legal";

/**
 * Public pages anyone can read without signing in: the app's homepage, privacy
 * policy and terms. Google's OAuth review needs them on the app's own domain.
 */
export default async function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const { contactEmail, operator } = legalInfo(branding.name);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/about" className="flex items-center gap-2">
            <BrandLogo branding={branding} />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-text-2">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="font-semibold text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="legal mx-auto max-w-3xl px-4 py-10">{children}</main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-3xl px-4 py-6 text-xs text-text-3">
          © {new Date().getFullYear()} {operator}
          {contactEmail ? ` · ${contactEmail}` : ""}
        </p>
      </footer>
    </div>
  );
}
