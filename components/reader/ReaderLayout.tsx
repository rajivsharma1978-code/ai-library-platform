"use client";

import { ReactNode, useState } from "react";

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

  return (
    <main className="h-screen w-full overflow-hidden bg-[#f4ead7] text-slate-950">
      <div className="grid h-full grid-cols-[64px_1fr_380px]">
        {/* Collapsed / Expandable Info Rail */}
        <aside className="border-r border-amber-200 bg-slate-950 text-white">
          <button
            onClick={() => setInfoOpen(true)}
            className="m-3 rounded-2xl bg-white/10 px-3 py-3 text-xs font-black hover:bg-white/20"
          >
            Info
          </button>
        </aside>

        {/* Main Flipbook Stage */}
        <section className="h-screen overflow-auto px-8 py-6">
          {center}
        </section>

        {/* AI Tutor */}
        <aside className="h-screen overflow-hidden border-l border-slate-800 bg-black text-white">
          {rightPanel}
        </aside>
      </div>

      {/* Slide-out Info Panel */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="h-full w-80 bg-slate-950 p-6 text-white shadow-2xl">
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