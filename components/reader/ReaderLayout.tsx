"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type ReaderLayoutProps = {
  leftPanel: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
};

// How long the Exit Fullscreen control stays visible after the mouse
// last moved before it fades out — kept short so it's out of the way
// almost all the time, not because it needs to be (it's a small corner
// overlay, not a reserved strip), but so it never lingers over content.
const EXIT_CONTROL_IDLE_MS = 2200;

export default function ReaderLayout({
  leftPanel,
  center,
  rightPanel,
}: ReaderLayoutProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exitControlVisible, setExitControlVisible] = useState(true);
  const mainRef = useRef<HTMLElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
      // Close info panel on fullscreen enter so it doesn't overlap
      if (document.fullscreenElement) setInfoOpen(false);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  // Exit Fullscreen auto-hides after a short idle period and reappears on
  // any mouse movement — only active while actually in fullscreen, so it
  // never affects the normal (non-fullscreen) layout at all.
  useEffect(() => {
    if (!isFullscreen) return;
    setExitControlVisible(true);
    function resetIdleTimer() {
      setExitControlVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setExitControlVisible(false), EXIT_CONTROL_IDLE_MS);
    }
    resetIdleTimer();
    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("touchstart", resetIdleTimer);
    return () => {
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("touchstart", resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFullscreen]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      mainRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <main
      ref={mainRef}
      className="h-screen w-full overflow-hidden bg-[#f4ead7] text-slate-950"
    >
      <div
        className={`ndl-reader-grid grid h-full transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isFullscreen
            ? "grid-cols-[1fr_380px]"
            : "grid-cols-[64px_1fr_380px]"
        }`}
      >
        {/* Collapsed info + fullscreen rail — hidden in fullscreen, and
            also hidden under Focus Mode (Phase B3): it's "unnecessary
            controls", not the book/navigation/toolbar Focus Mode keeps. */}
        {!isFullscreen && (
          <aside data-a11y-focus-hide className="flex flex-col border-r border-amber-200 bg-slate-950 text-white">
            <button
              onClick={() => setInfoOpen(true)}
              className="ndl-press m-3 rounded-2xl bg-white/10 px-3 py-3 text-xs font-black hover:bg-white/20"
              title="Book info"
            >
              📖
            </button>

            <button
              onClick={toggleFullscreen}
              className="ndl-press m-3 mt-0 rounded-2xl bg-white/10 px-3 py-3 text-xs font-black hover:bg-white/20"
              title="Enter fullscreen"
            >
              ⛶
            </button>
          </aside>
        )}

        {/* Main reading stage — no reserved space for Exit Fullscreen;
            book height and layout are identical in and out of fullscreen. */}
        <section className="relative h-screen overflow-hidden px-4 py-3">
          {center}
        </section>

        {/* Exit Fullscreen — a small circular overlay pinned to the
            viewport's own top-right corner, OUTSIDE this grid entirely
            (fixed, not absolute-within-section) so it floats above
            everything without taking part in — or disturbing — any
            toolbar's layout. Auto-hides after a short idle period and
            reappears on mouse movement, so in practice it's almost never
            on screen at the same time as anything it could overlap. */}
        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            title="Exit fullscreen (Esc)"
            aria-label="Exit fullscreen"
            className="ndl-press fixed right-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-base text-white shadow-lg backdrop-blur-sm transition-opacity duration-300 hover:bg-black/85"
            style={{
              opacity: exitControlVisible ? 1 : 0,
              pointerEvents: exitControlVisible ? "auto" : "none",
            }}
          >
            ✕
          </button>
        )}

        {/* AI Companion panel — always visible, even in fullscreen, but
            hidden under Focus Mode (Phase B3): it's a sidebar, and Focus
            Mode's whole point is stripping those back to just the book +
            navigation + accessibility toolbar. Voice commands still work
            while it's hidden — they don't depend on this panel's UI. */}
        <aside data-a11y-focus-hide className="h-screen overflow-hidden border-l border-slate-800 bg-black text-white">
          {rightPanel}
        </aside>
      </div>

      {/* Slide-out info panel — only in normal mode */}
      {infoOpen && !isFullscreen && (
        <div
          className="ndl-fade-in-scale fixed inset-0 z-50 bg-black/40"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="ndl-fade-in-scale h-full w-80 bg-slate-950 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setInfoOpen(false)}
              className="ndl-press mb-6 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
            >
              ← Close Info
            </button>
            {leftPanel}
          </div>
        </div>
      )}
    </main>
  );
}
