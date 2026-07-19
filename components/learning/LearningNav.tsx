"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type SectionKey =
  | "navMySpace" | "myLibraryTitle" | "navNotes" | "navRevision"
  | "commonFlashcards" | "quizPageTitle" | "navAnalytics" | "aiTutorNavSettings";

const SECTIONS: { href: string; labelKey: SectionKey }[] = [
  { href: "/my-space", labelKey: "navMySpace" },
  { href: "/my-library", labelKey: "myLibraryTitle" },
  { href: "/notes", labelKey: "navNotes" },
  { href: "/revision", labelKey: "navRevision" },
  { href: "/flashcards", labelKey: "commonFlashcards" },
  { href: "/quiz", labelKey: "quizPageTitle" },
  { href: "/analytics", labelKey: "navAnalytics" },
  { href: "/settings", labelKey: "aiTutorNavSettings" },
];

// /my-books is the same "your saved books" concept as /my-library (distinct
// filter tabs, not a distinct destination) — it highlights My Library here
// rather than getting its own primary nav item. The route itself is
// untouched and stays reachable exactly as it is today.
const ACTIVE_ALIASES: Record<string, string> = { "/my-books": "/my-library" };

/** Persistent My Learning navigation — mounted once per page, directly
 * beneath that page's existing header. Desktop shows all 8 sections in a
 * single row; below the `lg` breakpoint it collapses into a "My Learning"
 * button that expands a same-page panel, so eight items never get crammed
 * into cramped horizontal tabs on narrow screens. */
export default function LearningNav() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const normalizedPath = ACTIVE_ALIASES[pathname ?? ""] ?? pathname;
  const activeSection = SECTIONS.find(s => s.href === normalizedPath);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <nav aria-label={t.navMyLearning} className="mb-8">
      {/* Desktop / large tablet — single-row bar beneath the page header */}
      <div className="hidden lg:flex items-center gap-1 overflow-x-auto rounded-2xl bg-white/70 p-1.5 shadow-[0_6px_20px_rgba(75,45,12,0.08)] ring-1 ring-black/5">
        {SECTIONS.map(s => {
          const isActive = activeSection?.href === s.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "flex-shrink-0 whitespace-nowrap rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow"
                  : "flex-shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
              }
            >
              {t[s.labelKey]}
              {isActive && <span className="sr-only"> ({t.learningNavCurrentSectionSr})</span>}
            </Link>
          );
        })}
      </div>

      {/* Tablet / mobile — collapsible "My Learning" menu */}
      <div className="lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? t.learningNavCloseMenu : t.learningNavOpenMenu}
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between rounded-2xl bg-white/70 px-4 py-3 shadow-[0_6px_20px_rgba(75,45,12,0.08)] ring-1 ring-black/5"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900">
            <span aria-hidden="true">🧭</span>
            <span className="flex-shrink-0">{t.navMyLearning}</span>
            {activeSection && (
              <span className="truncate text-amber-700">· {t[activeSection.labelKey]}</span>
            )}
          </span>
          <span aria-hidden="true" className={`flex-shrink-0 text-xs text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>

        {open && (
          <div
            id={menuId}
            ref={panelRef}
            role="menu"
            aria-label={t.navMyLearning}
            className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-white p-2 shadow-[0_10px_30px_rgba(75,45,12,0.12)] ring-1 ring-black/5"
          >
            {SECTIONS.map(s => {
              const isActive = activeSection?.href === s.href;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  onNavigate={() => setOpen(false)}
                  className={
                    isActive
                      ? "rounded-xl bg-amber-500 px-3 py-2.5 text-center text-xs font-bold text-white"
                      : "rounded-xl bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-600 hover:bg-amber-50 hover:text-amber-700"
                  }
                >
                  {t[s.labelKey]}
                  {isActive && <span className="sr-only"> ({t.learningNavCurrentSectionSr})</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
