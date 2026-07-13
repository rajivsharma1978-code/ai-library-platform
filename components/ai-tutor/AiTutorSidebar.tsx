"use client";

// ── AI Tutor dashboard sidebar ──────────────────────────────────────────
// Collapsible left navigation for the /ai-tutor dashboard, same pattern as
// components/reader-premium/ReaderNav.tsx (own localStorage key, icon+label
// collapsing to icon-only) but with the dashboard's own link set instead of
// the Reader's. Kept scoped to app/ai-tutor/page.tsx per the redesign brief
// ("Only redesign and reorganize the AI Tutor landing page") rather than
// generalized into components/ui/ — nothing else consumes it yet.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UI_TEXT } from "@/lib/i18n";

const NAV_COLLAPSED_KEY = "ndl_ai_tutor_nav_collapsed";

type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

export default function AiTutorSidebar({ t }: { t: UIText }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevForceRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(NAV_COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === "true");
      else setCollapsed(window.innerWidth < 1024);
    } catch { /* localStorage unavailable — default expanded */ }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const links: { href: string; icon: string; label: string }[] = [
    { href: "/ai-tutor", icon: "🏠", label: t.commonHome },
    { href: "/my-library", icon: "📚", label: t.myLibraryTitle },
    { href: "/notes", icon: "📝", label: t.navNotes },
    { href: "/quiz", icon: "❓", label: t.aiTutorNavQuizzes },
    { href: "/analytics", icon: "📊", label: t.aiTutorNavProgress },
    { href: "/revision", icon: "🕘", label: t.aiTutorNavHistory },
    { href: "/settings", icon: "⚙️", label: t.aiTutorNavSettings },
  ];

  const width = !mounted || collapsed ? "w-16" : "w-56";

  return (
    <aside
      className={`flex h-full flex-shrink-0 flex-col border-r border-amber-200/70 bg-white transition-[width] duration-200 ${width}`}
    >
      <div className={`flex items-center gap-2 border-b border-amber-100 px-4 py-5 ${collapsed ? "justify-center px-3" : ""}`}>
        <span className="text-xl">🪷</span>
        {!collapsed && <span className="truncate text-sm font-black text-slate-900">{t.navAiTutor}</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 pt-3">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={`ndl-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                active ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 hover:bg-amber-50 hover:text-slate-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className="text-base leading-none">{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        title={collapsed ? t.aiTutorNavCollapse : undefined}
        className="ndl-press m-2 flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
      >
        <span>{collapsed ? "»" : "«"}</span>
        {!collapsed && <span>{t.aiTutorNavCollapse}</span>}
      </button>
    </aside>
  );
}
