"use client";

import { BookProfile } from "@/lib/premium-reader/bookProfile";

type PremiumReaderShellProps = {
  profile: BookProfile | null;
  children: React.ReactNode;
};

export default function PremiumReaderShell({
  profile,
  children,
}: PremiumReaderShellProps) {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-white/10 bg-neutral-900/80 p-4 lg:block">
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Premium Reader V2
          </p>

          <h1 className="mt-3 text-lg font-semibold">
            {profile?.title || "Loading book..."}
          </h1>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <p>Total pages: {profile?.totalPages || "..."}</p>
            <p>Layout: {profile?.preferredView || "auto"}</p>
            <p>Direction: {profile?.readingDirection || "ltr"}</p>
          </div>
        </aside>

        <section className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <span className="text-sm text-white/60">
              Adaptive PDF Layout Analyzer
            </span>

            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              V2 architecture
            </span>
          </header>

          <div className="flex flex-1">
            <section className="flex flex-1 items-center justify-center p-4">
              {children}
            </section>

            <aside className="hidden w-80 border-l border-white/10 bg-neutral-900/70 p-4 xl:block">
              <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                AI Companion
              </p>

              <div className="mt-4 space-y-3">
                {["Summary", "Explain", "Translate", "Quiz", "Notes"].map(
                  (item) => (
                    <button
                      key={item}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/75 hover:bg-white/10"
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}