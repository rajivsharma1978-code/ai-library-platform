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

/** Compact "My Learning" popover for the Premium Reader toolbar — the
 * seven My Learning destinations reachable from one trigger, without a
 * permanent nav bar or a second sidebar (ReaderNav's left rail already
 * covers Read/Library/Notes/Revision/AI Tutor/My Space as a persistent
 * rail; this is deliberately a separate, on-demand control, not a merge
 * into that rail, per the "no permanent 7-item bar" constraint).
 *
 * Shares the same viewport-clamped placement/interaction pattern as
 * LanguagePopover — the Reader's other toolbar popover, in the same
 * controls-strip row — so it behaves identically in fullscreen: fixed
 * positioning escapes the zoomed/transformed book area, same z-index,
 * already proven not to be clipped or layered behind the canvas.
 *
 * No current-book save happens here — PremiumReaderPreviewContent's
 * existing G-2B effect already saves on every bookId/readerPage change,
 * so by the time a destination is clicked the record is already current;
 * adding a second write here would be redundant. */
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
        className={`ndl-press inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors ${
          open
            ? "bg-orange-600 text-white shadow"
            : "bg-amber-50/70 text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100"
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
          className="ndl-fade-in-scale fixed z-[200] rounded-2xl border border-amber-100 bg-white p-2 shadow-[0_16px_50px_rgba(75,45,12,0.20)]"
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
                className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-amber-50 hover:text-amber-700"
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
