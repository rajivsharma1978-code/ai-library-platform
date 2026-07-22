"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useAdaptivePanelPlacement } from "@/lib/panelPlacement";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type DestinationKey =
  | "navMySpace" | "myLibraryTitle" | "navNotes" | "navRevision"
  | "commonFlashcards" | "quizPageTitle" | "navAnalytics";

const DESTINATIONS: { href: string; icon: string; labelKey: DestinationKey }[] = [
  { href: "/my-space", icon: "🧠", labelKey: "navMySpace" },
  { href: "/my-library", icon: "📚", labelKey: "myLibraryTitle" },
  { href: "/notes", icon: "📝", labelKey: "navNotes" },
  { href: "/revision", icon: "🔄", labelKey: "navRevision" },
  { href: "/flashcards", icon: "🃏", labelKey: "commonFlashcards" },
  { href: "/quiz", icon: "❓", labelKey: "quizPageTitle" },
  { href: "/analytics", icon: "📊", labelKey: "navAnalytics" },
];

/** Compact "My Learning" popover for the Normal Reader toolbar — the only
 * route Normal Reader has into the connected learning journey (My Space,
 * My Library, Notes, Revision, Flashcards, Quiz, Analytics), since this
 * reader has no persistent nav rail the way Premium Reader does. Same
 * viewport-clamped placement/interaction pattern as LanguagePopover and
 * LearningNav's mobile menu — trigger + on-demand panel, onNavigate
 * closes it on selection (this Next.js build's Link doesn't support a
 * plain onClick for that; see AdminSidebar/LearningNav for the same
 * fix), Escape/click-outside close it too. */
export default function ReaderLearningMenu() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const { triggerRef, panelRef, placement } = useAdaptivePanelPlacement(open, 264);
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        (triggerRef.current as HTMLElement | null)?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panelRef, triggerRef]);

  return (
    <>
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? t.learningNavCloseMenu : t.navMyLearning}
        title={t.navMyLearning}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-colors ${
          open
            ? "bg-slate-900 text-white"
            : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        <span aria-hidden="true">🧭</span>
        <span className="hidden sm:inline">{t.navMyLearning}</span>
      </button>

      {open && (
        <div
          id={menuId}
          ref={panelRef}
          role="menu"
          aria-label={t.navMyLearning}
          className="fixed z-[200] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_50px_rgba(15,23,42,0.20)]"
          style={{
            top: placement?.top ?? -9999,
            left: placement?.left ?? -9999,
            width: 264,
            visibility: placement ? "visible" : "hidden",
          }}
        >
          <p className="mb-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t.navMyLearning}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                role="menuitem"
                onNavigate={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                <span aria-hidden="true" className="text-base leading-none">{d.icon}</span>
                <span className="leading-tight">{t[d.labelKey]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
