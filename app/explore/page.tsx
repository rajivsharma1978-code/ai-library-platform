"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import BookCover from "@/components/ui/BookCover";
import AppButton from "@/components/ui/AppButton";

// Widened to `string` values (rather than `typeof UI_TEXT["en"]` directly)
// so every helper/subcomponent below accepts `t` for ANY of the 6
// language variants, not just the literal-typed English one.
type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

// ══════════════════════════════════════════════════════════════════════
// /explore — DISCOVER KNOWLEDGE, not a second book grid. /library already
// owns search/browse/filter/save; this page's job is the opposite one:
// surface ideas, careers, and learning paths, with books as only one
// small part of that (a handful of book cards total, never a catalog
// grid). Every "go read about X" action hands off to /library?q=X (see
// the small, additive `?q=` pickup in app/library/page.tsx) rather than
// reimplementing search here.
//
// This pass layers "AI-first, personalized" framing on top of the
// original discovery sections — difficulty/time/AI-tutor/quiz badges,
// a shared JourneyStageCard (used by BOTH the compact horizontal AI
// Learning Paths AND the new vertical Knowledge Journey, so the two
// views share one data model and one render function instead of two),
// and a mocked-but-deterministic "recommended for you" rail. All of the
// per-item numbers (learner counts, hours, book counts) are DEMO values
// — seeded from a stable hash of the item's own key so they're
// consistent across reloads instead of randomly reshuffling, without
// needing any backend. ═══════════════════════════════════════════════

const READING_PROGRESS_KEY = "ndl_reading_progress";

interface ReadingProgressEntry {
  bookId: string;
  currentPage: number;
  totalPages: number;
  lastReadAt: number;
}

function readProgress(): ReadingProgressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READING_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Deterministic demo-data helpers — a stable hash of a string seed,
// so every "12,400 learners" / "6 Hours" style number is fixed per item
// (reproducible across reloads/languages) rather than reshuffling on
// every render. No randomness, no backend, no per-render recompute
// beyond a cheap integer hash. ───────────────────────────────────────
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}
function pickFrom<T>(seed: string, options: readonly T[]): T {
  return options[hashSeed(seed) % options.length];
}
function pickRange(seed: string, min: number, max: number): number {
  return min + (hashSeed(seed) % (max - min + 1));
}
function difficultyFor(seed: string, t: UIText): string {
  return pickFrom(seed, [t.exploreDifficultyBeginner, t.exploreDifficultyIntermediate, t.exploreDifficultyAdvanced]);
}

// Topic/career/collection/path catalogs are UI_TEXT KEYS, not raw
// strings — every label here is fully localized the same way the rest
// of the app is, across all 6 languages.
const TRENDING_TOPICS: { icon: string; key: keyof UIText }[] = [
  { icon: "🤖", key: "exploreTopicAI" },
  { icon: "🚀", key: "exploreTopicSpace" },
  { icon: "⚖️", key: "exploreTopicConstitution" },
  { icon: "⚛️", key: "exploreTopicQuantum" },
  { icon: "🌍", key: "exploreTopicClimate" },
  { icon: "🩺", key: "exploreTopicHealthcare" },
  { icon: "🏛️", key: "exploreTopicAncientIndia" },
  { icon: "💡", key: "exploreTopicInnovation" },
];

const AI_LEARNING_PATH: { icon: string; key: keyof UIText }[] = [
  { icon: "💻", key: "explorePathStepComputerBasics" },
  { icon: "⌨️", key: "explorePathStepProgramming" },
  { icon: "➗", key: "explorePathStepMathematics" },
  { icon: "🧮", key: "explorePathStepMachineLearning" },
  { icon: "🧠", key: "explorePathStepDeepLearning" },
  { icon: "✨", key: "explorePathStepGenerativeAI" },
];

const CAREERS: { icon: string; key: keyof UIText }[] = [
  { icon: "🏛️", key: "exploreCareerIAS" },
  { icon: "🔬", key: "exploreCareerScientist" },
  { icon: "🩺", key: "exploreCareerDoctor" },
  { icon: "⚖️", key: "exploreCareerLawyer" },
  { icon: "🍎", key: "exploreCareerTeacher" },
  { icon: "🚀", key: "exploreCareerEntrepreneur" },
  { icon: "⚙️", key: "exploreCareerEngineer" },
  { icon: "📊", key: "exploreCareerDataScientist" },
  { icon: "🧑‍🚀", key: "exploreCareerAstronaut" },
];

const COLLECTIONS: { icon: string; titleKey: keyof UIText; descKey: keyof UIText }[] = [
  { icon: "🎓", titleKey: "exploreCollectionStudents", descKey: "exploreCollectionStudentsDesc" },
  { icon: "🏛️", titleKey: "exploreCollectionUpsc", descKey: "exploreCollectionUpscDesc" },
  { icon: "🤖", titleKey: "exploreCollectionAiBeginner", descKey: "exploreCollectionAiBeginnerDesc" },
  { icon: "🛠️", titleKey: "exploreCollectionFutureSkills", descKey: "exploreCollectionFutureSkillsDesc" },
  { icon: "🪷", titleKey: "exploreCollectionHeritage", descKey: "exploreCollectionHeritageDesc" },
  { icon: "🚀", titleKey: "exploreCollectionEntrepreneurship", descKey: "exploreCollectionEntrepreneurshipDesc" },
];

// ── Knowledge Journey — ONE shared data model for both the compact
// horizontal "AI Learning Paths" roadmap and the new vertical "Knowledge
// Journey" section below it, so the two views never drift out of sync
// and there is exactly one stage-card renderer (JourneyStageCard) for
// both, per-stage stats are demo values ("Demo values are acceptable"),
// progress state is a fixed demo sequence illustrating what a learner
// partway through the path would see. ───────────────────────────────
type StageState = "completed" | "current" | "recommendedNext" | "locked" | "futureGoal";
const JOURNEY_STAGE_STATS: { books: number; hours: number; quiz: boolean }[] = [
  { books: 8, hours: 3, quiz: true },
  { books: 10, hours: 5, quiz: true },
  { books: 6, hours: 4, quiz: true },
  { books: 12, hours: 6, quiz: true },
  { books: 9, hours: 7, quiz: true },
  { books: 5, hours: 8, quiz: false },
];
const JOURNEY_STAGE_STATE: StageState[] = ["completed", "completed", "current", "recommendedNext", "locked", "futureGoal"];
const CURRENT_STAGE_PERCENT = 67;
const JOURNEY_STAGES = AI_LEARNING_PATH.map((step, i) => ({
  ...step,
  ...JOURNEY_STAGE_STATS[i],
  state: JOURNEY_STAGE_STATE[i],
}));

function stageStateLabel(state: StageState, t: UIText): string {
  switch (state) {
    case "completed": return t.exploreStageCompleted;
    case "current": return t.exploreStageCurrent;
    case "recommendedNext": return t.exploreStageRecommendedNext;
    case "locked": return t.exploreStageLocked;
    case "futureGoal": return t.exploreStageFutureGoal;
  }
}

// Deterministic "pick of the day" — same result for everyone on the same
// calendar day (a real per-day rotation, not a random pick on every
// render/reload), cycling through whatever the live catalog currently
// has so it can never point at a book that doesn't exist.
function dayIndex(length: number): number {
  if (length <= 0) return 0;
  const dayNumber = Math.floor(Date.now() / 86400000);
  return dayNumber % length;
}

export default function ExplorePage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const catalog = usePublicCatalog();
  const router = useRouter();

  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [surpriseTopic, setSurpriseTopic] = useState<{ icon: string; label: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const surpriseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setProgress(readProgress());
    return () => {
      if (surpriseTimerRef.current) clearTimeout(surpriseTimerRef.current);
    };
  }, []);

  const dailyBook = useMemo<CatalogBook | null>(() => {
    if (catalog.length === 0) return null;
    return catalog[dayIndex(catalog.length)];
  }, [catalog]);
  const dailyTopic = useMemo(() => {
    const topic = TRENDING_TOPICS[dayIndex(TRENDING_TOPICS.length + 3)];
    return topic ? t[topic.key] : "";
  }, [t]);
  const dailyDifficulty = useMemo(() => (dailyBook ? difficultyFor(dailyBook.id, t) : ""), [dailyBook, t]);
  const dailyHours = useMemo(() => (dailyBook ? pickRange(`${dailyBook.id}::hours`, 3, 10) : 0), [dailyBook]);

  // Real reading progress only — Continue Learning is conditional on the
  // user actually having read something (per spec), never a demo
  // fallback like some other pages use for the same underlying key.
  const continueLearning = useMemo(() => {
    return progress
      .map((p) => ({ book: catalog.find((b) => b.id === p.bookId), progress: p }))
      .filter((x): x is { book: CatalogBook; progress: ReadingProgressEntry } => !!x.book)
      .sort((a, b) => b.progress.lastReadAt - a.progress.lastReadAt)
      .slice(0, 3);
  }, [progress, catalog]);

  const isDailyBookContinuing = continueLearning.some((c) => c.book.id === dailyBook?.id);

  // "Recommended For You" — grounded in REAL catalog books (with real
  // covers/links) rather than inventing books that don't exist in the
  // library, so every card's "Start Learning" goes somewhere real. The
  // book already shown in Continue Learning is excluded so this rail
  // reads as a genuinely different suggestion, not a repeat.
  const recommendationTopic = continueLearning[0]?.book.category || dailyTopic;
  const recommendations = useMemo(() => {
    const excludeId = continueLearning[0]?.book.id;
    return catalog.filter((b) => b.id !== excludeId).slice(0, 4);
  }, [catalog, continueLearning]);

  // Surprise Me's pool spans every category the page itself links to
  // (topics, the learning path, careers, collections, and real books) —
  // "Book / Learning Path / Topic / Career / Collection" per spec.
  const surprisePool = useMemo(() => {
    const pool: { icon: string; label: string; href: string }[] = [];
    TRENDING_TOPICS.forEach((topic) => pool.push({ icon: topic.icon, label: t[topic.key], href: `/library?q=${encodeURIComponent(t[topic.key])}` }));
    pool.push({ icon: "🎯", label: t.explorePathAiName, href: `/library?q=${encodeURIComponent(t.explorePathAiName)}` });
    CAREERS.forEach((career) => pool.push({ icon: career.icon, label: t[career.key], href: `/library?q=${encodeURIComponent(t[career.key])}` }));
    COLLECTIONS.forEach((c) => pool.push({ icon: c.icon, label: t[c.titleKey], href: `/library?q=${encodeURIComponent(t[c.titleKey])}` }));
    catalog.forEach((book) => pool.push({ icon: "📖", label: book.title, href: `/reader-premium?book=${book.id}` }));
    return pool;
  }, [t, catalog]);

  function surpriseMe() {
    if (revealing || surprisePool.length === 0) return;
    let pick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
    // Never repeat the same result twice in a row — a "surprise" that
    // can hand back exactly what you just saw doesn't feel like one.
    if (surpriseTopic && surprisePool.length > 1) {
      while (pick.label === surpriseTopic.label) {
        pick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
      }
    }
    setSurpriseTopic({ icon: pick.icon, label: pick.label });
    setRevealing(true);
    surpriseTimerRef.current = setTimeout(() => {
      router.push(pick.href);
    }, 900);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} homeLabel={t.commonHome} />

        {/* ── ✨ Daily AI Discovery — the hero. Placed first so the very
            first screen sells an IDEA, not a shelf of books. One real
            book (deterministic "pick of the day") + a badge row that
            makes the recommendation feel personalized (reason, rating,
            difficulty, estimated time, AI Tutor availability, and a
            Continue Learning callout when this happens to be a book the
            learner is already partway through). ─────────────────────── */}
        {dailyBook && (
          <section className="mt-4 ndl-fade-in-scale overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-[0_24px_70px_rgba(30,20,5,0.35)] sm:p-10">
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              <div className="h-44 w-32 flex-shrink-0 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 sm:h-56 sm:w-40">
                <BookCover book={dailyBook} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{t.exploreDailyEyebrow}</p>
                <h2 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{t.exploreDailyHeading}</h2>
                <p className="mt-3 text-xl font-bold text-amber-50 break-words">&ldquo;{dailyBook.title}&rdquo;</p>
                <p className="mt-1 text-amber-300" aria-hidden>★★★★★ <span className="text-sm font-bold text-amber-100">{t.exploreRecommendedBadge}</span></p>
                <p className="mt-2 text-sm text-white/70 break-words">
                  <span className="font-bold text-white/90">{t.exploreDailyReasonLabel}: </span>
                  {t.exploreDailyReasonTemplate.replace("{topic}", dailyTopic)}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <StatBadge tone="dark" icon="📊" label={dailyDifficulty} />
                  <StatBadge tone="dark" icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(dailyHours))} />
                  <StatBadge tone="dark" icon="🤖" label={t.exploreAiTutorAvailableLabel} />
                  {isDailyBookContinuing && <StatBadge tone="dark" icon="🔄" label={t.exploreContinueLearningBadge} />}
                </div>
                <div className="mt-5 flex justify-center sm:justify-start">
                  <AppButton href={`/reader-premium?book=${dailyBook.id}`} variant="accent" size="md">
                    🤖 {t.exploreDailyCta}
                  </AppButton>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 🔥 Trending Knowledge ─────────────────────────────────────── */}
        <SectionHeading title={t.exploreTrendingTitle} subtitle={t.exploreTrendingSubtitle} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRENDING_TOPICS.map((topic) => {
            const learners = pickRange(topic.key, 2000, 24000);
            const recommended = hashSeed(topic.key) % 2 === 0;
            const learnersLabel = t.exploreLearnersTemplate.replace("{count}", learners.toLocaleString());
            return (
              <Link
                key={topic.key}
                href={`/library?q=${encodeURIComponent(t[topic.key])}`}
                aria-label={`${t[topic.key]} — ${t.exploreTrendingBadge}, ${learnersLabel}${recommended ? `, ${t.exploreRecommendedBadge}` : ""}`}
                className="ndl-press relative flex flex-col items-center gap-1.5 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                {recommended && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    {t.exploreRecommendedBadge}
                  </span>
                )}
                <span className="text-3xl" aria-hidden>{topic.icon}</span>
                <span className="text-sm font-bold text-slate-800 break-words">{t[topic.key]}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600">🔥 {t.exploreTrendingBadge}</span>
                <span className="text-[10px] font-medium tabular-nums text-slate-400">{learnersLabel}</span>
              </Link>
            );
          })}
        </div>

        {/* ── 🎯 AI Learning Paths — the compact horizontal roadmap. Reuses
            JourneyStageCard(compact) so this and Knowledge Journey below
            share one stage renderer instead of two parallel copies. ──── */}
        <SectionHeading title={t.explorePathsTitle} subtitle={t.explorePathsSubtitle} />
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-2xl text-white" aria-hidden>🤖</span>
            <h3 className="text-xl font-black text-slate-950">{t.explorePathAiName}</h3>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch sm:gap-2">
            {JOURNEY_STAGES.map((stage, i) => (
              <div key={stage.key} className="flex min-w-0 flex-1 flex-col items-center sm:flex-row">
                <div className="w-full min-w-0">
                  <JourneyStageCard stage={stage} t={t} compact />
                </div>
                {i < JOURNEY_STAGES.length - 1 && (
                  <span className="flex-shrink-0 py-1 text-lg text-amber-400 sm:px-1" aria-hidden>
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 🧠 Knowledge Journey (NEW) — the flagship "you are here"
            roadmap: the SAME six stages as AI Learning Paths above,
            rendered as a vertical Duolingo/Coursera-style path with full
            per-stage detail (books/quiz/AI tutor/hours) and progress
            state (completed/current/recommended-next/locked/future). ── */}
        <SectionHeading title={t.exploreJourneyTitle} subtitle={t.exploreJourneySubtitle} />
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <div className="mx-auto flex max-w-xl flex-col">
            {JOURNEY_STAGES.map((stage, i) => (
              <div key={stage.key}>
                <JourneyStageCard stage={stage} t={t} />
                {i < JOURNEY_STAGES.length - 1 && (
                  <div className="flex justify-center py-1 text-lg text-amber-300" aria-hidden>↓</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 💼 Explore by Career — now real navigation (per spec:
            "Click should navigate to Library with relevant books"),
            enhanced with demo recommended-books/duration/AI-tutor stats
            instead of the old click-to-reveal "coming soon" card. ───── */}
        <SectionHeading title={t.exploreCareersTitle} subtitle={t.exploreCareersSubtitle} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAREERS.map((career) => {
            const books = pickRange(career.key, 20, 60);
            const hours = pickRange(`${career.key}::dur`, 40, 150);
            return (
              <Link
                key={career.key}
                href={`/library?q=${encodeURIComponent(t[career.key])}`}
                className="ndl-press flex flex-col items-center gap-2 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                <span className="text-3xl" aria-hidden>{career.icon}</span>
                <span className="text-sm font-bold text-slate-800 break-words">{t[career.key]}</span>
                <span className="text-[10px] font-bold text-amber-700">{t.exploreCareerRecommendedBooksTemplate.replace("{count}", String(books))}</span>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <StatBadge icon="🗺️" label={t.exploreCareerLearningPathAvailable} />
                  <StatBadge icon="🤖" label={t.exploreAiTutorLabel} />
                </div>
                <span className="text-[10px] text-slate-400">{t.exploreCareerAverageDurationLabel}: {t.exploreHoursTemplate.replace("{count}", String(hours))}</span>
              </Link>
            );
          })}
        </div>

        {/* ── 🧠 Continue Learning — conditional: only when the user has
            real reading progress, never a demo fallback. Each card now
            offers three ways back in — Continue Reading (primary,
            real), Resume AI Tutor, Resume Quiz (both real pages, just
            not book-scoped resume state — an honest, demo-scope quick
            link rather than fabricated per-book progress). ──────────── */}
        {continueLearning.length > 0 && (
          <>
            <SectionHeading title={t.exploreContinueTitle} subtitle={t.exploreContinueWhereLeftOff} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {continueLearning.map(({ book, progress: p }) => {
                const pct = p.totalPages > 0 ? Math.min(100, Math.max(0, Math.round((p.currentPage / p.totalPages) * 100))) : 0;
                return (
                  <div key={book.id} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5">
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl shadow">
                        <BookCover book={book} className="h-full w-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-black text-slate-950">{book.title}</h4>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-slate-500">{pct}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
                          📖 {t.exploreContinueReadingAction}
                        </AppButton>
                      </div>
                      <Link href="/ai-tutor" title={t.exploreContinueResumeAiTutor} aria-label={t.exploreContinueResumeAiTutor}
                        className="ndl-press flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm hover:bg-slate-200">🤖</Link>
                      <Link href="/quiz" title={t.exploreContinueResumeQuiz} aria-label={t.exploreContinueResumeQuiz}
                        className="ndl-press flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm hover:bg-slate-200">📝</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 🤖 AI Recommendations For You (NEW) — grounded in real
            catalog books (real covers, real reader links) with mocked
            difficulty/estimated-time metadata, per the "for demo
            purposes... mocked" scope. ─────────────────────────────────── */}
        {recommendations.length > 0 && (
          <>
            <SectionHeading
              title={t.exploreRecommendationsTitle}
              subtitle={t.exploreRecommendationsReasonTemplate.replace("{topic}", recommendationTopic)}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recommendations.map((book) => {
                const difficulty = difficultyFor(book.id, t);
                const hours = pickRange(`${book.id}::rec`, 3, 10);
                return (
                  <div key={book.id} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]">
                    <div className="h-40 w-full overflow-hidden">
                      <BookCover book={book} className="h-full w-full" />
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <h4 className="truncate text-sm font-black text-slate-950">{book.title}</h4>
                      {book.category && <p className="truncate text-[11px] text-slate-500">{book.category}</p>}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                        <StatBadge icon="📊" label={difficulty} />
                        <StatBadge icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(hours))} />
                      </div>
                      <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
                        {t.exploreStartLearningCta}
                      </AppButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 📚 AI Curated Collections ─────────────────────────────────── */}
        <SectionHeading title={t.exploreCollectionsTitle} subtitle={t.exploreCollectionsSubtitle} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLLECTIONS.map((c) => {
            const books = pickRange(c.titleKey, 8, 40);
            const hours = pickRange(`${c.titleKey}::dur`, 4, 30);
            return (
              <Link
                key={c.titleKey}
                href={`/library?q=${encodeURIComponent(t[c.titleKey])}`}
                className="ndl-press flex flex-col gap-2 rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                <span className="text-3xl" aria-hidden>{c.icon}</span>
                <h4 className="font-black text-slate-950 break-words">{t[c.titleKey]}</h4>
                <p className="text-sm text-slate-500">{t[c.descKey]}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatBadge icon="📚" label={t.explorePathBooksTemplate.replace("{count}", String(books))} />
                  <StatBadge icon="🤖" label={t.exploreCollectionsAiTutorReady} />
                  <StatBadge icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(hours))} />
                </div>
                <span className="mt-2 text-xs font-bold text-orange-600">{t.exploreExploreCollectionCta} →</span>
              </Link>
            );
          })}
        </div>

        {/* ── 🎲 Surprise Me — one button; every click reveals a random
            target from EVERY category the page links to (topic, career,
            collection, the learning path, or a real book), then auto-
            navigates there after a short reveal animation. ───────────── */}
        <section className="mt-10 mb-6">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-lg font-black text-slate-900">{t.exploreSurpriseTitle}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{t.exploreSurpriseSubtitle}</p>
            <button
              onClick={surpriseMe}
              disabled={revealing}
              aria-label={t.exploreSurpriseButton}
              className="ndl-press mt-5 inline-flex items-center gap-2 rounded-full bg-orange-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(194,65,12,0.3)] hover:bg-orange-700 disabled:opacity-60"
            >
              🎲 {t.exploreSurpriseButton}
            </button>
            {surpriseTopic && (
              <div className="ndl-fade-in-scale mt-6 flex flex-col items-center gap-3" role="status" aria-live="polite">
                <div className="flex items-center gap-3 rounded-full bg-amber-50 px-6 py-3 ring-1 ring-amber-100">
                  <span className="text-2xl" aria-hidden>{surpriseTopic.icon}</span>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                      {revealing ? t.exploreSurpriseRevealing : t.exploreSurpriseResultPrefix}
                    </p>
                    <p className="font-black text-slate-900 break-words">{surpriseTopic.label}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      <AccessibilityToolbar />
    </main>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4 mt-10">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 break-words">{subtitle}</p>
    </div>
  );
}

// Small icon+label pill, reused across every enhanced section (Daily
// Discovery, Learning Path/Journey stages, Career, Collections) instead
// of each section inventing its own badge markup.
function StatBadge({ icon, label, tone = "light" }: { icon: string; label: string; tone?: "light" | "dark" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
        tone === "dark" ? "bg-white/10 text-white/90" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span className="break-words">{label}</span>
    </span>
  );
}

// The one stage-card renderer shared by both the compact horizontal "AI
// Learning Paths" roadmap and the full vertical "Knowledge Journey" —
// `compact` hides the stat badges and shrinks padding, everything else
// (state styling, checkmark/current-stage treatment, navigation) is
// identical between the two views. Every stage stays a real link (per
// spec: "hover/tap any stage should open Library filtered to that
// topic") — locked/future stages are simply styled as muted rather than
// disabled, so the roadmap never becomes a dead end.
function JourneyStageCard({
  stage, t, compact,
}: {
  stage: typeof JOURNEY_STAGES[number];
  t: UIText;
  compact?: boolean;
}) {
  const isCompleted = stage.state === "completed";
  const isCurrent = stage.state === "current";
  const isMuted = stage.state === "locked" || stage.state === "futureGoal";
  const stateLabel = stageStateLabel(stage.state, t);
  const href = `/library?q=${encodeURIComponent(t[stage.key])}`;

  const stateTextClass =
    isCompleted ? "text-emerald-600" :
    isCurrent ? "text-amber-600" :
    stage.state === "recommendedNext" ? "text-orange-600" :
    "text-slate-400";

  const cardClass = `block min-w-0 rounded-2xl ring-1 transition ${compact ? "p-2.5" : "p-3.5"} ${
    isCurrent ? "ndl-current-stage bg-amber-50 ring-amber-300" :
    isCompleted ? "bg-emerald-50/70 ring-emerald-100" :
    isMuted ? "bg-slate-50 opacity-60 ring-slate-100" :
    "bg-white ring-slate-100 hover:-translate-y-0.5 hover:shadow-md"
  }`;

  return (
    <Link
      href={href}
      className={`ndl-press ${cardClass}`}
      aria-label={`${t[stage.key]} — ${stateLabel}${isCurrent ? `, ${t.explorePercentCompleteTemplate.replace("{percent}", String(CURRENT_STAGE_PERCENT))}` : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-lg ${
            isCompleted ? "bg-emerald-100" : isCurrent ? "bg-amber-100" : "bg-slate-100"
          }`}
          aria-hidden
        >
          {isCompleted ? "✅" : isCurrent ? "🟡" : stage.state === "recommendedNext" ? "⭐" : stage.state === "locked" ? "🔒" : stage.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-slate-900 sm:text-sm">{t[stage.key]}</p>
          <p className={`truncate text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${stateTextClass}`}>
            {stateLabel}
            {isCurrent && ` · ${t.explorePercentCompleteTemplate.replace("{percent}", String(CURRENT_STAGE_PERCENT))}`}
          </p>
        </div>
      </div>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <StatBadge icon="📚" label={t.explorePathBooksTemplate.replace("{count}", String(stage.books))} />
          {stage.quiz && <StatBadge icon="📝" label={t.exploreQuizLabel} />}
          <StatBadge icon="🤖" label={t.exploreAiTutorLabel} />
          <StatBadge icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(stage.hours))} />
        </div>
      )}
    </Link>
  );
}
