"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type ReaderLayoutProps = {
  leftPanel: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
};

export default function ReaderLayout({
  leftPanel,
  center,
  rightPanel,
}: ReaderLayoutProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
      // Close info panel on fullscreen enter so it doesn't overlap
      if (document.fullscreenElement) setInfoOpen(false);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

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
        className={`grid h-full transition-[grid-template-columns] duration-300 ${
          isFullscreen
            ? "grid-cols-[1fr_380px]"
            : "grid-cols-[64px_1fr_380px]"
        }`}
      >
        {/* Collapsed info + fullscreen rail — hidden in fullscreen */}
        {!isFullscreen && (
          <aside className="flex flex-col border-r border-amber-200 bg-slate-950 text-white">
            <button
              onClick={() => setInfoOpen(true)}
              className="m-3 rounded-2xl bg-white/10 px-3 py-3 text-xs font-black hover:bg-white/20"
              title="Book info"
            >
              📖
            </button>

            <button
              onClick={toggleFullscreen}
              className="m-3 mt-0 rounded-2xl bg-white/10 px-3 py-3 text-xs font-black hover:bg-white/20"
              title="Enter fullscreen"
            >
              ⛶
            </button>
          </aside>
        )}

        {/* Main reading stage */}
        <section className="relative h-screen overflow-auto px-8 py-6">
          {/* Fullscreen exit button — floats top-right when in fullscreen */}
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute right-4 top-4 z-50 rounded-full bg-black/60 px-4 py-2 text-xs font-bold text-white shadow hover:bg-black/80"
              title="Exit fullscreen (Esc)"
            >
              ✕ Exit Fullscreen
            </button>
          )}
          {center}
        </section>

        {/* AI Companion panel — always visible, even in fullscreen */}
        <aside className="h-screen overflow-hidden border-l border-slate-800 bg-black text-white">
          {rightPanel}
        </aside>
      </div>

      {/* Slide-out info panel — only in normal mode */}
      {infoOpen && !isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="h-full w-80 bg-slate-950 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setInfoOpen(false)}
              className="mb-6 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
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
