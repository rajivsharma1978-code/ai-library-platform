"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import BookCover from "@/components/ui/BookCover";
import AppButton from "@/components/ui/AppButton";

type UIText = typeof UI_TEXT["en"];

// ══════════════════════════════════════════════════════════════════════
// /explore — DISCOVER KNOWLEDGE, not a second book grid. /library already
// owns search/browse/filter/save; this page's job is the opposite one:
// surface ideas, careers, and learning paths, with books as only one
// small part of that (a handful of book cards total, never a catalog
// grid). Every "go read about X" action hands off to /library?q=X (see
// the small, additive `?q=` pickup added to app/library/page.tsx) rather
// than reimplementing search here.
// ══════════════════════════════════════════════════════════════════════

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

// Topic/career/collection catalogs are UI_TEXT KEYS, not raw strings —
// every label here is fully localized the same way the rest of the app
// is, across all 6 languages.
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

  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [surpriseTopic, setSurpriseTopic] = useState<{ icon: string; label: string } | null>(null);

  useEffect(() => {
    setProgress(readProgress());
  }, []);

  const dailyBook = useMemo<CatalogBook | null>(() => {
    if (catalog.length === 0) return null;
    return catalog[dayIndex(catalog.length)];
  }, [catalog]);
  const dailyTopic = useMemo(() => {
    const topic = TRENDING_TOPICS[dayIndex(TRENDING_TOPICS.length + 3)];
    return topic ? t[topic.key] : "";
  }, [t]);

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

  function surpriseMe() {
    const pool = TRENDING_TOPICS;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    // Never repeat the same result twice in a row — a "surprise" that
    // can hand back exactly what you just saw doesn't feel like one.
    if (surpriseTopic && pool.length > 1) {
      while (t[pick.key] === surpriseTopic.label) {
        pick = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    setSurpriseTopic({ icon: pick.icon, label: t[pick.key] });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} homeLabel={t.commonHome} />

        {/* ── ✨ Daily AI Discovery — the hero. Placed first so the very
            first screen sells an IDEA, not a shelf of books, per spec
            ("the first screen should encourage users to discover ideas
            instead of simply browsing books"). One real book (deterministic
            "pick of the day" from the live catalog) + one plain-language
            reason, not a recommendation engine — matches the "for now"
            scope of every other AI-flavored card on this page. ────────── */}
        {dailyBook && (
          <section className="mt-4 overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-[0_24px_70px_rgba(30,20,5,0.35)] sm:p-10">
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              <div className="h-44 w-32 flex-shrink-0 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 sm:h-56 sm:w-40">
                <BookCover book={dailyBook} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{t.exploreDailyEyebrow}</p>
                <h2 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{t.exploreDailyHeading}</h2>
                <p className="mt-3 text-xl font-bold text-amber-50">&ldquo;{dailyBook.title}&rdquo;</p>
                <p className="mt-2 text-sm text-white/70">
                  {t.exploreDailyReasonTemplate.replace("{topic}", dailyTopic)}
                </p>
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
          {TRENDING_TOPICS.map((topic) => (
            <Link
              key={topic.key}
              href={`/library?q=${encodeURIComponent(t[topic.key])}`}
              className="ndl-press flex flex-col items-center gap-2 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
            >
              <span className="text-3xl" aria-hidden>{topic.icon}</span>
              <span className="text-sm font-bold text-slate-800">{t[topic.key]}</span>
            </Link>
          ))}
        </div>

        {/* ── 🎯 AI Learning Paths ──────────────────────────────────────── */}
        <SectionHeading title={t.explorePathsTitle} subtitle={t.explorePathsSubtitle} />
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-2xl text-white" aria-hidden>🤖</span>
            <h3 className="text-xl font-black text-slate-950">{t.explorePathAiName}</h3>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-0">
            {AI_LEARNING_PATH.map((step, i) => (
              <div key={step.key} className="flex flex-1 flex-col items-center sm:flex-row">
                <div className="flex w-full flex-col items-center gap-1.5 rounded-2xl bg-amber-50/70 px-3 py-4 text-center ring-1 ring-amber-100">
                  <span className="text-2xl" aria-hidden>{step.icon}</span>
                  <span className="text-xs font-bold text-slate-800">{t[step.key]}</span>
                </div>
                {i < AI_LEARNING_PATH.length - 1 && (
                  <span className="flex-shrink-0 py-1 text-lg text-amber-400 sm:px-1" aria-hidden>
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center sm:justify-start">
            <AppButton href={`/library?q=${encodeURIComponent(t.explorePathAiName)}`} variant="secondary" size="sm">
              {t.exploreDailyCta}
            </AppButton>
          </div>
        </div>

        {/* ── 💼 Explore by Career ──────────────────────────────────────── */}
        <SectionHeading title={t.exploreCareersTitle} subtitle={t.exploreCareersSubtitle} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAREERS.map((career) => (
            <CareerCard key={career.key} icon={career.icon} label={t[career.key]} comingSoon={t.exploreCareerComingSoon} />
          ))}
        </div>

        {/* ── 🧠 Continue Learning — conditional: only when the user has
            real reading progress, per spec ("If user has already been
            reading something"). No demo fallback here (deliberately
            unlike some other pages that reuse this same key), so this
            section simply doesn't render until ndl_reading_progress has
            real entries. ─────────────────────────────────────────────── */}
        {continueLearning.length > 0 && (
          <>
            <SectionHeading title={t.exploreContinueTitle} subtitle={t.exploreContinueSubtitle} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {continueLearning.map(({ book, progress: p }) => {
                const pct = p.totalPages > 0 ? Math.round((p.currentPage / p.totalPages) * 100) : 0;
                return (
                  <div key={book.id} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5">
                    <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl shadow">
                      <BookCover book={book} className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-black text-slate-950">{book.title}</h4>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <div className="mt-2">
                        <AppButton href={`/reader-premium?book=${book.id}`} variant="secondary" size="sm">
                          {t.exploreContinueResume}
                        </AppButton>
                      </div>
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
          {COLLECTIONS.map((c) => (
            <Link
              key={c.titleKey}
              href="/library"
              className="ndl-press block rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
            >
              <span className="text-3xl" aria-hidden>{c.icon}</span>
              <h4 className="mt-3 font-black text-slate-950">{t[c.titleKey]}</h4>
              <p className="mt-1.5 text-sm text-slate-500">{t[c.descKey]}</p>
            </Link>
          ))}
        </div>

        {/* ── 🎲 Surprise Me — one button, a different topic every click;
            this is the page's signature/playful moment. ───────────────── */}
        <section className="mt-10 mb-6">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-lg font-black text-slate-900">{t.exploreSurpriseTitle}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{t.exploreSurpriseSubtitle}</p>
            <button
              onClick={surpriseMe}
              className="ndl-press mt-5 inline-flex items-center gap-2 rounded-full bg-orange-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(194,65,12,0.3)] hover:bg-orange-700"
            >
              🎲 {t.exploreSurpriseButton}
            </button>
            {surpriseTopic && (
              <div className="ndl-fade-in-scale mt-6 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 rounded-full bg-amber-50 px-6 py-3 ring-1 ring-amber-100">
                  <span className="text-2xl" aria-hidden>{surpriseTopic.icon}</span>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">{t.exploreSurpriseResultPrefix}</p>
                    <p className="font-black text-slate-900">{surpriseTopic.label}</p>
                  </div>
                </div>
                <AppButton href={`/library?q=${encodeURIComponent(surpriseTopic.label)}`} variant="primary" size="sm">
                  {t.exploreDailyCta}
                </AppButton>
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
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

// Career cards are demo-only per spec ("For now create beautiful demo
// cards" — real per-career book/curriculum recommendations are future
// work) — clicking reveals an honest "coming soon" line inline instead of
// linking somewhere that doesn't back it up yet.
function CareerCard({ icon, label, comingSoon }: { icon: string; label: string; comingSoon: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="ndl-press flex flex-col items-center gap-2 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
    >
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="text-sm font-bold text-slate-800">{label}</span>
      {open && <span className="ndl-fade-in-scale text-[11px] font-medium text-amber-700">{comingSoon}</span>}
    </button>
  );
}
