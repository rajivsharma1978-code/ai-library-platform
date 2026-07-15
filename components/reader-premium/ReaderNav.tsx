"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// ── Collapsible left navigation (Phase C3) ─────────────────────────────
// Replaces the old 2-icon rail (Book info / Fullscreen) with the primary
// app links, so the Reader stops being an isolated screen — matches the
// same warm cream/navy/saffron system as the homepage, My Space, and the
// public Library, never the dark/blue theme the old rail + AI panel used.
// Collapsed state persists (own localStorage key — additive, not a
// change to any existing schema) so returning readers keep their
// preferred width.

const NAV_COLLAPSED_KEY = "ndl_reader_nav_collapsed";

// `label` is resolved from UI_TEXT inside the component (see LINK_LABEL
// below) — this array now only holds the language-independent href/icon.
const LINKS: { href: string; icon: string }[] = [
  { href: "/reader-premium", icon: "📖" },
  { href: "/library", icon: "🏛️" },
  { href: "/notes", icon: "📝" },
  { href: "/revision", icon: "🔄" },
  { href: "/ai-tutor", icon: "🤖" },
  { href: "/my-space", icon: "🧠" },
];

export default function ReaderNav({
  /** True right when entering fullscreen — collapses the nav to icon-only
   *  ONCE at that transition (per the fullscreen spec: "collapsed by
   *  default... can be temporarily expanded if needed"). The user's own
   *  toggle below keeps working normally afterward; this never re-forces
   *  collapse on every render, only on the false→true edge. */
  forceCollapsed = false,
}: { forceCollapsed?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevForceRef = useRef(forceCollapsed);
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const LINK_LABEL: Record<string, string> = {
    "/reader-premium": t.navRead,
    "/library": t.navLibrary,
    "/notes": t.navNotes,
    "/revision": t.navRevision,
    "/ai-tutor": t.navAiTutor,
    "/my-space": t.navMySpace,
  };

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(NAV_COLLAPSED_KEY);
      if (stored !== null) {
        setCollapsed(stored === "true");
      } else {
        // No explicit preference yet — default to icon-only on tablet/
        // mobile widths (spec: "Tablet: left nav icon-only") so the book
        // isn't crushed by a full-width nav on a narrow screen. The
        // user's own toggle from here on is remembered as usual.
        setCollapsed(window.innerWidth < 1024);
      }
    } catch { /* localStorage unavailable — default expanded */ }
  }, []);

  useEffect(() => {
    if (forceCollapsed && !prevForceRef.current) setCollapsed(true);
    prevForceRef.current = forceCollapsed;
  }, [forceCollapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Before mount, render nothing wider than the collapsed rail so there's
  // no layout flash once the persisted width is known.
  const width = !mounted || collapsed ? "w-16" : "w-48";

  return (
    <aside
      data-a11y-focus-hide
      className={`ndl-press flex h-full flex-shrink-0 flex-col border-r border-amber-200/70 bg-white transition-[width] duration-200 ${width}`}
    >
      <div className={`flex items-center gap-2 border-b border-amber-100 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
        <span className="text-lg">🪷</span>
        {!collapsed && <span className="truncate text-xs font-black uppercase tracking-widest text-amber-800">NDL AI</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {LINKS.map((link) => {
          const active = pathname === link.href || (link.href === "/reader-premium" && pathname?.startsWith("/reader-premium"));
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? LINK_LABEL[link.href] : undefined}
              className={`ndl-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                active ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 hover:bg-amber-50 hover:text-slate-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className="text-base leading-none">{link.icon}</span>
              {!collapsed && <span className="truncate">{LINK_LABEL[link.href]}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        title={collapsed ? t.readerNavExpandTitle : t.readerNavCollapseTitle}
        className={`ndl-press m-2 flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 ${collapsed ? "" : ""}`}
      >
        <span>{collapsed ? "»" : "«"}</span>
        {!collapsed && <span>{t.aiTutorNavCollapse}</span>}
      </button>
    </aside>
  );
}
