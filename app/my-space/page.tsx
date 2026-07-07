"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { directorBooks } from "@/lib/directorBooks";
import {
  buildMySpaceDashboard, activityLabel, bookCoverUrl,
  DirectorBook,
} from "@/components/my-space/mySpaceData";

// ── Small shared primitives (kept local — this page is the only consumer) ─

function BookCoverThumb({ book, className = "" }: { book?: DirectorBook; className?: string }) {
  const cover = bookCoverUrl(book);
  const initials = (book?.title ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cover} alt={book?.title ?? "Book cover"} className={`object-cover ${className}`} />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-[linear-gradient(135deg,#f4d58d_0%,#c18a3f_60%,#8a5a24_100%)] text-white font-black ${className}`}>
      <span style={{ fontSize: "1.4em" }}>{initials || "📖"}</span>
    </div>
  );
}

function ProgressBar({ pct, colorClass = "bg-amber-500" }: { pct: number; colorClass?: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-200/70">
      <div className={`h-2.5 rounded-full ${colorClass} transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function StatCard({ icon, label, value, isDemo }: { icon: string; label: string; value: number | string; isDemo?: boolean }) {
  return (
    <div className="relative rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5">
      {isDemo && (
        <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
          demo
        </span>
      )}
      <div className="text-2xl">{icon}</div>
      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function QuickActionButton({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-slate-800"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );
}

export default function MySpacePage() {
  // Dashboard data reads localStorage, so it's computed client-side only
  // (after mount) to avoid any server/client markup mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dashboard = useMemo(() => {
    if (!mounted) return null;
    return buildMySpaceDashboard(directorBooks as DirectorBook[]);
  }, [mounted]);

  if (!dashboard) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-bold text-amber-700">Loading your space…</div>
      </main>
    );
  }

  const {
    greeting, currentBook, currentProgress, progressPct,
    daysRemaining, estimatedCompletionDate,
    stats, usingDemoStats,
    activity, usingDemoActivity,
    continueStudyingBooks, usingDemoLibrary,
    relatedBooks, recommendedTopics, suggestedNext,
  } = dashboard;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">

        {/* ── SECTION 1: Welcome Back ─────────────────────────────────── */}
        <header>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">National Digital Library AI · My Space</p>
          <h1 className="mt-1 text-3xl font-black text-slate-950 sm:text-4xl">{greeting}. 👋</h1>
          <p className="mt-2 text-sm text-slate-600">Your personal AI learning workspace — everything you're reading, highlighting, and studying, in one place.</p>
        </header>

        {/* ── SECTION 2: Continue Reading ─────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-900">Continue Reading</h2>
          <div className="flex flex-col gap-6 rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.12)] ring-1 ring-black/5 sm:flex-row sm:items-center">
            <div className="mx-auto h-40 w-28 flex-shrink-0 overflow-hidden rounded-2xl shadow-lg sm:mx-0">
              <BookCoverThumb book={currentBook} className="h-full w-full" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Pick up where you left off</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">{currentBook?.title ?? "Untitled"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Page {currentProgress.currentPage} of {currentProgress.totalPages}
                {currentProgress.chapter ? ` · ${currentProgress.chapter}` : ""}
              </p>
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Reading progress</span>
                  <span>{progressPct}%</span>
                </div>
                <ProgressBar pct={progressPct} />
              </div>
            </div>
            <div className="flex-shrink-0">
              <Link
                href={`/reader-premium?book=${currentBook?.id ?? ""}`}
                className="inline-block rounded-full bg-amber-500 px-7 py-3 text-sm font-black text-white shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-amber-600"
              >
                📖 Continue Reading
              </Link>
            </div>
          </div>
        </section>

        {/* ── SECTION 3: Today's Learning ──────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-900">Today's Learning</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon="📚" label="Books Reading" value={stats.booksReading} isDemo={usingDemoStats.booksReading} />
            <StatCard icon="⭐" label="Highlights" value={stats.highlights} isDemo={usingDemoStats.highlights} />
            <StatCard icon="📝" label="Notes" value={stats.notes} isDemo={usingDemoStats.notes} />
            <StatCard icon="🔖" label="Bookmarks" value={stats.bookmarks} isDemo={usingDemoStats.bookmarks} />
            <StatCard icon="🤖" label="AI Questions Asked" value={stats.aiQuestions} isDemo={usingDemoStats.aiQuestions} />
          </div>
        </section>

        {/* ── SECTION 4: Recent Activity ───────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">Recent Activity</h2>
            {usingDemoActivity && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                includes demo activity
              </span>
            )}
          </div>
          <div className="rounded-[2rem] bg-white p-3 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            {activity.map((item, i) => {
              const { icon, verb } = activityLabel(item.type);
              return (
                <div key={item.id} className={`flex items-start gap-4 px-4 py-4 ${i !== activity.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-lg">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-bold">{verb}</span>{" "}
                      <span className="font-bold text-amber-700">{item.bookTitle ?? "a book"}</span>
                    </p>
                    {item.detail && <p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p>}
                  </div>
                  <span className="flex-shrink-0 text-xs font-semibold text-slate-400">{timeAgo(item.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECTION 5: Reading Progress ───────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-lg font-black text-slate-900">Reading Progress</h2>
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Book</p>
                <p className="mt-1 truncate text-sm font-black text-slate-900">{currentBook?.title ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Chapter</p>
                <p className="mt-1 truncate text-sm font-black text-slate-900">{currentProgress.chapter ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pages Read</p>
                <p className="mt-1 text-sm font-black text-slate-900">{currentProgress.currentPage} / {currentProgress.totalPages}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Estimated Completion</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {estimatedCompletionDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  <span className="ml-1 font-normal text-slate-500">(~{daysRemaining}d)</span>
                </p>
              </div>
            </div>
            <div className="mt-5">
              <ProgressBar pct={progressPct} />
            </div>
          </div>
        </section>

        {/* ── SECTION 6: Continue Studying ─────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">Continue Studying</h2>
            {usingDemoLibrary && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">demo</span>
            )}
          </div>
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
            {continueStudyingBooks.map(book => (
              <div key={book.id} className="w-44 flex-shrink-0 rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5">
                <div className="h-32 w-full overflow-hidden rounded-2xl">
                  <BookCoverThumb book={book} className="h-full w-full" />
                </div>
                <p className="mt-3 truncate text-sm font-black text-slate-900">{book.title}</p>
                {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
                <Link
                  href={`/reader-premium?book=${book.id}`}
                  className="mt-3 block rounded-full bg-slate-950 px-3 py-2 text-center text-xs font-bold text-white hover:bg-slate-800"
                >
                  Continue Reading
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 7: AI Recommendations ────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">AI Recommendations</h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">demo</span>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Based on “{currentBook?.title ?? "your current book"}”</p>

            <div className="mt-4">
              <p className="text-sm font-black text-slate-800">Related books</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {relatedBooks.map(b => (
                  <Link
                    key={b.id}
                    href={`/reader-premium?book=${b.id}`}
                    className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                  >
                    📖 {b.title}
                  </Link>
                ))}
                {relatedBooks.length === 0 && <p className="text-xs text-slate-400">No other books in the library yet.</p>}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-sm font-black text-slate-800">Topics you might like</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recommendedTopics.map(t => (
                  <span key={t} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{t}</span>
                ))}
              </div>
            </div>

            {suggestedNext && (
              <div className="mt-5 rounded-2xl bg-[linear-gradient(120deg,#fff8e8,#f3e6c8)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Suggested next reading</p>
                <p className="mt-1 text-sm font-black text-slate-900">{suggestedNext.title}</p>
                {suggestedNext.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{suggestedNext.description}</p>}
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 8: Quick Actions ──────────────────────────────────── */}
        <section className="pb-6">
          <h2 className="mb-4 text-lg font-black text-slate-900">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <QuickActionButton href="/reader-premium" icon="📖" label="Continue Reading" />
            <QuickActionButton href="/notes" icon="📝" label="Open My Notes" />
            <QuickActionButton href="/revision" icon="🧠" label="Revision" />
            <QuickActionButton href="/my-library" icon="📚" label="My Library" />
            <QuickActionButton href="/analytics" icon="📊" label="Analytics" />
            <QuickActionButton href="/library" icon="🏛️" label="Explore Library" />
          </div>
        </section>

      </div>
    </main>
  );
}

// ── Small formatting helper ────────────────────────────────────────────
function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
