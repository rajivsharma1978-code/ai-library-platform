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
}

/** Standard page header used across app pages (My Space, My Library, My
 * Books, AI Tutor, Normal Reader, etc.) — title + optional subtitle/badge
 * on the left, a Home/Back link (and optional extra content) on the
 * right. Kept deliberately simple so every page's header reads the same
 * way at a glance. */
export default function PageHeader({ title, subtitle, homeLabel, homeHref = "/", badge, right, showHomeLink = true }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {badge && (
          <p className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">{badge}</p>
        )}
        <h1 className="text-4xl font-black text-slate-950">{title}</h1>
        {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {right}
        {showHomeLink && (
          <Link href={homeHref} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            ← {homeLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
