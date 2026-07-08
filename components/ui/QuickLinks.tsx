"use client";

import Link from "next/link";

export interface QuickLink {
  href: string;
  icon: string;
  label: string;
}

export interface QuickLinksProps {
  title: string;
  links: QuickLink[];
  className?: string;
}

/** Consistent "Quick Links" pill row — same pattern used on AI Tutor,
 * My Books, and the AI Companion sidebar's Shortcuts section. */
export default function QuickLinks({ title, links, className = "" }: QuickLinksProps) {
  return (
    <section className={className}>
      <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-slate-100"
          >
            <span>{l.icon}</span><span>{l.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
