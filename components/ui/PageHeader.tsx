"use client";

import Link from "next/link";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  homeLabel: string;
  homeHref?: string;
  badge?: string;
  right?: React.ReactNode;
  /** Set to false to omit the Home/Back link — used only where a
   * persistent section navigation already provides a way out (e.g. Admin
   * pages, which have AdminSidebar). Defaults to true everywhere else, so
   * every existing call site is unaffected. */
  showHomeLink?: boolean;
  /** Optional second nav-out link, rendered as a plain (no-arrow) button
   * to the left of the primary Home/Back link. Only the AI Tutor workspace
   * pages pass this — they need two distinct destinations ("back to the AI
   * Tutor dashboard", the primary homeHref/homeLabel above, vs. "back to
   * the platform landing page", this one) now that /ai-tutor is its own
   * workspace rather than reusing "Home" for both. Omitted (undefined) on
   * every other call site, so nothing else renders a second button. */
  secondaryHomeHref?: string;
  secondaryHomeLabel?: string;
}

/** Standard page header used across app pages (My Space, My Library, My
 * Books, AI Tutor, Normal Reader, etc.) — title + optional subtitle/badge
 * on the left, a Home/Back link (and optional extra content) on the
 * right. Kept deliberately simple so every page's header reads the same
 * way at a glance. */
export default function PageHeader({
  title, subtitle, homeLabel, homeHref = "/", badge, right, showHomeLink = true,
  secondaryHomeHref, secondaryHomeLabel,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      {/* min-w-0: without it, a flex item's default min-width:auto
          refuses to shrink below its content's min-content width — for
          text that means the widest UNBREAKABLE word, not the wrapped
          line width. Most titles never hit that floor, but a long
          single word in scripts without hyphenation (e.g. Tamil/Telugu)
          at text-4xl can exceed the row's own width and push the whole
          header past the viewport at narrow widths. min-w-0 lets this
          column shrink to fit and wrap normally instead. */}
      <div className="min-w-0">
        {badge && (
          <p className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">{badge}</p>
        )}
        {/* break-words: min-w-0 above lets this column shrink to fit,
            but a single WORD still can't shrink below its own intrinsic
            width by wrapping alone — scripts without hyphenation (Tamil,
            Telugu) can have one word at text-4xl wider than the whole
            column on a narrow phone. break-words allows breaking inside
            that word as a last resort, instead of it overflowing past
            the edge of the page. */}
        <h1 className="text-4xl font-black text-slate-950 break-words">{title}</h1>
        {subtitle && <p className="mt-2 text-slate-600 break-words">{subtitle}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {right}
        {secondaryHomeHref && secondaryHomeLabel && (
          <Link href={secondaryHomeHref} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {secondaryHomeLabel}
          </Link>
        )}
        {showHomeLink && (
          <Link href={homeHref} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            ← {homeLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
