"use client";

import { useEffect, useState } from "react";
import { useAdaptivePanelPlacement } from "@/lib/panelPlacement";

const LANGUAGES = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"] as const;
export type Lang = typeof LANGUAGES[number];

const NATIVE_LABEL: Record<Lang, string> = {
  English: "English", Hindi: "हिंदी", Tamil: "தமிழ்", Bengali: "বাংলা", Marathi: "मराठी", Telugu: "తెలుగు",
};

/**
 * Single globe-icon trigger + compact popover for the AI response
 * language — one control shared by the reader toolbar (this component)
 * and read as plain text inside AI Companion, instead of two separate
 * selectors. Viewport-clamped via the same adaptive placement utility
 * the Accessibility/Voice panels already use.
 */
export default function LanguagePopover({
  language, onLanguageChange, availableLanguages,
  /** "icon" (default) — the 🌐 trigger used in the reader toolbar.
   *  "link" — a small "Change" text link, used inside AI Companion next
   *  to "Responding in {language}". Both instances share the same
   *  language/onLanguageChange state from the parent — selecting a
   *  language in either one updates the one shared value, so this is
   *  still a single control with two trigger points, not a duplicate
   *  selector. */
  variant = "icon",
}: {
  language: Lang;
  onLanguageChange: (lang: Lang) => void;
  availableLanguages: Lang[];
  variant?: "icon" | "link";
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, placement } = useAdaptivePanelPlacement(open, 220);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panelRef, triggerRef]);

  return (
    <>
      {variant === "icon" ? (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          onClick={() => setOpen((o) => !o)}
          title={`Response language: ${language}`}
          aria-label="Choose response language"
          className="ndl-press inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow ring-1 ring-slate-200 hover:bg-amber-50"
        >
          🌐
        </button>
      ) : (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          onClick={() => setOpen((o) => !o)}
          aria-label="Choose response language"
          className="ndl-press text-[11px] font-bold text-orange-700 underline-offset-2 hover:underline"
        >
          Change
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          className="ndl-fade-in-scale fixed z-[200] rounded-2xl border border-amber-100 bg-white p-2 shadow-[0_16px_50px_rgba(75,45,12,0.20)]"
          style={{
            top: placement?.top ?? -9999,
            left: placement?.left ?? -9999,
            width: 220,
            visibility: placement ? "visible" : "hidden",
          }}
        >
          <p className="mb-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Response Language
          </p>
          {LANGUAGES.filter((l) => availableLanguages.includes(l)).map((l) => (
            <button
              key={l}
              onClick={() => { onLanguageChange(l); setOpen(false); }}
              className={`ndl-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                l === language ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-amber-50"
              }`}
            >
              <span>{l}{l !== "English" ? <span className="ml-1.5 text-xs text-slate-400">{NATIVE_LABEL[l]}</span> : null}</span>
              {l === language && <span className="text-orange-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
