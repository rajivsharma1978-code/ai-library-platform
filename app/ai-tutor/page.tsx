"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog } from "@/lib/catalog";
import AppButton from "@/components/ui/AppButton";
import InfoCard from "@/components/ui/InfoCard";
import StatCard from "@/components/ui/StatCard";
import SearchBar from "@/components/ui/SearchBar";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import CoverThumb from "@/components/ui/BookCover";
import AiTutorSidebar from "@/components/ai-tutor/AiTutorSidebar";
import { buildAiTutorDashboard, type DirectorBook } from "@/components/ai-tutor/aiTutorData";

type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

// The app's real signed-in user record — written by app/sign-in/page.tsx
// on login, already read the same way by components/home/SiteHeader.tsx.
// Reused here rather than inventing a separate demo-name key: when nobody
// is signed in (the common case for this demo) this is simply absent, and
// the greeting falls back to a name-less "Welcome back!".
interface NDLUser { name: string; role: string; }

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-200/70">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

// Compact horizontal recommendation card — cover, title, author, category,
// one action. Deliberately smaller than the old grid cards so 4-6 fit in a
// single scrollable row instead of dominating the page.
function RecommendedCard({ book, t }: { book: DirectorBook; t: UIText }) {
  return (
    <Link
      href={`/reader-premium?book=${book.id}`}
      className="group w-40 flex-shrink-0 rounded-2xl bg-white p-3 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 transition-shadow hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)] sm:w-44"
    >
      <div className="h-40 w-full overflow-hidden rounded-xl">
        <CoverThumb book={book} className="h-full w-full transition-transform group-hover:scale-105" />
      </div>
      <h3 className="mt-2.5 truncate text-sm font-black text-slate-900">{book.title}</h3>
      {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
      {book.category && (
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-amber-700">{book.category}</p>
      )}
    </Link>
  );
}

function QuickActionTile({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl bg-white px-3 py-4 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-bold leading-tight text-slate-700">{label}</span>
    </Link>
  );
}

export default function AiTutorPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<NDLUser | null>(null);
  const [search, setSearch] = useState("");
  const catalogBooks = usePublicCatalog();

  useEffect(() => {
    const stored = window.localStorage.getItem("ndlUser");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore malformed value */ }
    }
    setMounted(true);
  }, []);

  const dashboard = useMemo(() => buildAiTutorDashboard(catalogBooks), [catalogBooks]);
  const { continueBook, continueProgress, usingFallbackContinue, stats, usingDemoStats, recommended } = dashboard;
  const continueProgressPct = continueProgress
    ? Math.min(100, Math.round((continueProgress.currentPage / Math.max(1, continueProgress.totalPages)) * 100))
    : 0;

  // Filters the Recommended row locally — kept entirely inside this page
  // (no other route's search behavior changes) rather than routing to
  // /library, so the header search field is genuinely useful without
  // touching any other page's search implementation.
  const filteredRecommended = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recommended;
    return recommended.filter(b =>
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.category?.toLowerCase().includes(q)
    );
  }, [recommended, search]);

  const greeting = user?.name ? `${t.aiTutorWelcomeBack}, ${user.name}!` : `${t.aiTutorWelcomeBack}!`;

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="animate-pulse text-sm font-semibold text-slate-400">{t.commonLoading}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
      <AiTutorSidebar t={t} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-950 sm:text-4xl">{greeting} 👋</h1>
              <p className="mt-1 text-slate-600">{t.aiTutorSubtitle}</p>
            </div>
            <div className="w-full sm:w-72">
              <SearchBar value={search} onChange={setSearch} placeholder={t.aiTutorSearchPlaceholder} />
            </div>
          </div>

          {/* ── Continue Learning hero ─────────────────────────────────── */}
          {continueBook && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">{t.aiTutorContinueLearning}</h2>
                {usingFallbackContinue && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    {t.aiTutorSuggested}
                  </span>
                )}
              </div>
              <InfoCard className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="mx-auto h-40 w-28 flex-shrink-0 overflow-hidden rounded-2xl shadow-lg sm:mx-0">
                  <CoverThumb book={continueBook} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                    {usingFallbackContinue ? t.aiTutorPopularWithLearners : t.aiTutorPickUpWhere}
                  </p>
                  <h3 className="mt-1 truncate text-2xl font-black text-slate-950">{continueBook.title}</h3>
                  {continueBook.author && <p className="mt-1 text-sm text-slate-500">{continueBook.author}</p>}
                  {continueProgress && (
                    <>
                      <p className="mt-2 text-sm text-slate-500">
                        {continueProgress.chapter ? `${continueProgress.chapter} · ` : ""}
                        {t.commonPage} {continueProgress.currentPage} / {continueProgress.totalPages} ({continueProgressPct}%)
                      </p>
                      <div className="mt-2 max-w-xs sm:mx-0 mx-auto">
                        <ProgressBar pct={continueProgressPct} />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-400">
                        {t.aiTutorLastOpened} {new Date(continueProgress.lastReadAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-center gap-2 sm:items-end">
                  <AppButton href={`/reader-premium?book=${continueBook.id}`} variant="accent" size="lg" className="w-full sm:w-auto">
                    🤖 {t.aiTutorStart}
                  </AppButton>
                  <AppButton href={`/read?book=${continueBook.id}`} variant="secondary" size="md" className="w-full sm:w-auto">
                    📖 {t.aiTutorOrReadNormally}
                  </AppButton>
                  <Link href="/library" className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                    ⋯ {t.aiTutorMoreOptions}
                  </Link>
                </div>
              </InfoCard>
            </section>
          )}

          {/* ── Quick Actions ───────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-black text-slate-900">{t.aiTutorQuickActions}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <QuickActionTile href={`/reader-premium?book=${continueBook?.id ?? "quantum"}`} icon="🤖" label={t.aiTutorStart} />
              <QuickActionTile href="/quiz" icon="❓" label={t.aiTutorQaPracticeQuiz} />
              <QuickActionTile href="/my-library" icon="📚" label={t.aiTutorQaSummarizeLibrary} />
              <QuickActionTile href={`/reader-premium?book=${continueBook?.id ?? "quantum"}`} icon="💬" label={t.aiTutorQaAskQuestion} />
              <QuickActionTile href="/notes" icon="📝" label={t.aiTutorQaMyNotes} />
              <QuickActionTile href="/revision" icon="🔄" label={t.navRevision} />
            </div>
          </section>

          {/* ── Today's Progress ────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-black text-slate-900">{t.aiTutorTodaysProgress}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                icon="⏱️" label={t.aiTutorStatReadingTime}
                value={`${stats.readingTimeMinutes}/${stats.readingGoalMinutes} ${t.aiTutorMinAbbrev}`}
                badge={usingDemoStats.readingTime ? t.aiTutorDemoBadge : undefined}
              />
              <StatCard
                icon="🔥" label={t.aiTutorStatStudyStreak} value={stats.studyStreakDays}
                badge={usingDemoStats.studyStreak ? t.aiTutorDemoBadge : undefined}
              />
              <StatCard
                icon="✅" label={t.aiTutorStatQuizzesCompleted} value={stats.quizzesCompleted}
                badge={usingDemoStats.quizzesCompleted ? t.aiTutorDemoBadge : undefined}
              />
              <StatCard
                icon="📝" label={t.aiTutorStatNotesCreated} value={stats.notesCreated}
                badge={usingDemoStats.notesCreated ? t.aiTutorDemoBadge : undefined}
              />
              <StatCard
                icon="📚" label={t.aiTutorStatBooksInProgress} value={stats.booksInProgress}
                badge={usingDemoStats.booksInProgress ? t.aiTutorDemoBadge : undefined}
              />
            </div>
          </section>

          {/* ── Recommended for You ─────────────────────────────────────── */}
          {filteredRecommended.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-black text-slate-900">{t.aiTutorRecommended}</h2>
              <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
                {filteredRecommended.map(book => <RecommendedCard key={book.id} book={book} t={t} />)}
              </div>
            </section>
          )}

          {/* ── Upload / Browse ──────────────────────────────────────────── */}
          <section className="grid gap-5 pb-8 sm:grid-cols-2">
            <InfoCard tone="dark" className="transition-transform hover:-translate-y-0.5">
              <Link href="/read" className="block">
                <div className="text-2xl">📤</div>
                <h3 className="mt-2 text-lg font-black">{t.aiTutorUploadTitle}</h3>
                <p className="mt-1.5 text-sm text-slate-300">{t.aiTutorUploadDesc}</p>
              </Link>
            </InfoCard>
            <InfoCard className="transition-transform hover:-translate-y-0.5">
              <Link href="/library" className="block">
                <div className="text-2xl">🏛️</div>
                <h3 className="mt-2 text-lg font-black text-slate-900">{t.aiTutorBrowseTitle}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{t.aiTutorBrowseDesc}</p>
              </Link>
            </InfoCard>
          </section>

        </div>
      </main>
      <AccessibilityToolbar />
    </div>
  );
}
