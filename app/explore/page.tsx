"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import BookCover from "@/components/ui/BookCover";
import AppButton from "@/components/ui/AppButton";
import StatCard from "@/components/ui/StatCard";

// Widened to `string` values (rather than `typeof UI_TEXT["en"]` directly)
// so every helper/subcomponent below accepts `t` for ANY of the 6
// language variants, not just the literal-typed English one.
type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

// ══════════════════════════════════════════════════════════════════════
// /explore — "My AI Learning Coach", not a second book grid. /library
// already owns search/browse/filter/save; this page's job is the
// opposite one: guide a learner through ideas, careers, and a
// structured knowledge journey, with books as only one small part of
// that. Every "go read about X" action hands off to /library?q=X rather
// than reimplementing search here.
//
// This pass adds a coaching/progress layer on top of the AI-first
// discovery sections from the previous pass: an overall progress
// dashboard, a horizontal "Knowledge Journey 2.0" roadmap (replacing
// the old vertical checklist), a guided "Today's AI Learning Plan", and
// richer per-card detail (skills, trend %, last-opened/time-remaining)
// across the existing sections. All per-item numbers are DEMO values —
// seeded from a stable hash of the item's own key so they're
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

// Shared pool of demo "required skills" — reused (via a deterministic
// pick) across all 9 careers instead of authoring a unique skill list
// per career, keeping the i18n footprint small while still giving every
// card a plausible, varied skill set.
const SKILL_POOL: (keyof UIText)[] = [
  "exploreSkillPhysics", "exploreSkillResearch", "explorePathStepMathematics", "explorePathStepProgramming",
  "exploreSkillAI", "exploreSkillCommunication", "exploreSkillWriting", "exploreSkillLeadership",
  "exploreSkillDesign", "exploreSkillBiology", "exploreSkillEconomics", "exploreSkillLaw",
];
function skillsFor(seed: string, t: UIText): string[] {
  const start = hashSeed(seed) % SKILL_POOL.length;
  const picked: string[] = [];
  for (let i = 0; i < 4; i++) picked.push(t[SKILL_POOL[(start + i * 3) % SKILL_POOL.length]]);
  return picked;
}

// ── Knowledge Journey — ONE shared data model for both the compact
// horizontal "AI Learning Paths" roadmap and "Knowledge Journey 2.0"
// below it, so the two views never drift out of sync and there is
// exactly one stage-card renderer (JourneyStageCard) for both.
// Per-stage stats are demo values ("Demo values are acceptable"),
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
const CURRENT_JOURNEY_STAGE = JOURNEY_STAGES.find((s) => s.state === "current") ?? JOURNEY_STAGES[0];

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

// ── Daily Discovery's time-of-day rotation — a real (client clock),
// mocked-topic rotation: no backend, just three fixed buckets of the
// day, each pointing at one of the existing trending topics. ─────────
type DayPeriod = "morning" | "afternoon" | "evening";
function periodOfDay(): DayPeriod {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
const PERIOD_TOPIC_INDEX: Record<DayPeriod, number> = { morning: 5, afternoon: 0, evening: 6 };
function periodIcon(period: DayPeriod): string {
  return period === "morning" ? "🌅" : period === "afternoon" ? "☀️" : "🌙";
}
function periodLabel(period: DayPeriod, t: UIText): string {
  if (period === "morning") return t.exploreDailyPeriodMorning;
  if (period === "afternoon") return t.exploreDailyPeriodAfternoon;
  return t.exploreDailyPeriodEvening;
}

// ── Continue Learning's "last opened" / "time remaining" — real data
// (real timestamp, real remaining-page count), just formatted more
// richly. Intl.RelativeTimeFormat/toLocaleTimeString auto-localize
// "Yesterday"/"10:42 PM" per language with zero extra i18n keys. ─────
const INTL_LOCALE: Record<string, string> = { en: "en-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN" };
function formatLastOpened(timestamp: number, language: string): string {
  const locale = INTL_LOCALE[language] || "en-IN";
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const diffDays = Math.round((timestamp - Date.now()) / 86400000);
    const dayPart = rtf.format(diffDays, "day");
    const timePart = new Date(timestamp).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    return `${dayPart}, ${timePart}`;
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}
function formatRemaining(p: ReadingProgressEntry, t: UIText): string {
  const remainingPages = Math.max(0, p.totalPages - p.currentPage);
  const totalMinutes = Math.round(remainingPages * 1.5);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t.exploreContinueHoursMinutesTemplate.replace("{hours}", String(hours)).replace("{minutes}", String(minutes));
}

// ══════════════════════════════════════════════════════════════════════
// Explore detail system — ONE reusable content shape + renderer, built
// by small per-section functions below, instead of a separate page/
// component per section. Every card that used to jump straight to
// /library now opens one of these (in the ExploreDetailSheet modal, or
// inline for Surprise Me), and only the actions that are genuinely a
// "go search the catalog" step still carry a /library href. ═══════════
type DetailKind = "topic" | "career" | "learningPath" | "collection" | "book";

interface DetailAction {
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  href?: string;
  onClick?: () => void;
}

interface DetailListSection {
  label: string;
  items: string[];
}

interface DetailContent {
  kind: DetailKind;
  kindLabel: string;
  icon: string;
  title: string;
  description: string;
  badges?: { icon: string; label: string }[];
  lists?: DetailListSection[];
  actions: DetailAction[];
}

// Best-effort real-book match for a topic label, so "Start Learning"
// from a topic can open an actual catalog book instead of always
// falling back to AI Tutor — falls back gracefully since the demo
// catalog only has a few real titles.
function bestBookForTopic(label: string, catalog: CatalogBook[]): CatalogBook | null {
  const needle = label.toLowerCase();
  return catalog.find((b) => (b.category && b.category.toLowerCase().includes(needle)) || b.title.toLowerCase().includes(needle)) ?? null;
}

function buildTopicDetail(topic: { icon: string; key: keyof UIText }, t: UIText, catalog: CatalogBook[]): DetailContent {
  const label = t[topic.key];
  const learners = pickRange(topic.key, 2000, 24000);
  const book = bestBookForTopic(label, catalog);
  return {
    kind: "topic",
    kindLabel: t.exploreDetailKindTopic,
    icon: topic.icon,
    title: label,
    description: t.exploreTopicOverviewTemplate.replace("{learners}", learners.toLocaleString()),
    badges: [
      { icon: "🔥", label: t.exploreTrendingBadge },
      { icon: "🗺️", label: t.explorePathAiName },
    ],
    actions: [
      { label: t.exploreActionViewRelatedBooks, variant: "secondary", href: `/library?q=${encodeURIComponent(label)}` },
      { label: t.exploreStartLearningCta, variant: "primary", href: book ? `/reader-premium?book=${book.id}` : "/ai-tutor" },
      { label: t.exploreActionAskAiTutor, variant: "ghost", href: "/ai-tutor" },
    ],
  };
}

function buildCareerDetail(career: { icon: string; key: keyof UIText }, t: UIText, openDetail: (c: DetailContent) => void, readingTargetHref: string): DetailContent {
  const label = t[career.key];
  const books = pickRange(career.key, 20, 60);
  const hours = pickRange(`${career.key}::dur`, 40, 150);
  const skills = skillsFor(career.key, t);
  return {
    kind: "career",
    kindLabel: t.exploreDetailKindCareer,
    icon: career.icon,
    title: label,
    description: t.exploreCareerOverviewTemplate.replace("{career}", label),
    badges: [
      { icon: "📚", label: t.exploreCareerRecommendedBooksTemplate.replace("{count}", String(books)) },
      { icon: "⏱", label: t.exploreHoursTemplate.replace("{count}", String(hours)) },
      { icon: "🤖", label: t.exploreAiTutorLabel },
    ],
    lists: [{ label: t.exploreCareerSkillsLabel, items: skills }],
    actions: [
      { label: t.exploreActionViewCareerPath, variant: "secondary", href: "#ai-knowledge-journey" },
      { label: t.exploreStartLearningCta, variant: "primary", onClick: () => openDetail(buildJourneyStageDetail(CURRENT_JOURNEY_STAGE, t, openDetail, readingTargetHref)) },
      { label: t.exploreActionBrowseRelatedBooks, variant: "ghost", href: `/library?q=${encodeURIComponent(label)}` },
    ],
  };
}

// Shared by both AI Learning Paths (compact) and Knowledge Journey 2.0
// entry points — same six-stage data model, so both open the same
// state-dependent detail rather than two parallel content shapes.
function buildJourneyStageDetail(
  stage: typeof JOURNEY_STAGES[number],
  t: UIText,
  openDetail: (c: DetailContent) => void,
  readingTargetHref: string
): DetailContent {
  const idx = JOURNEY_STAGES.findIndex((s) => s.key === stage.key);
  const prev = idx > 0 ? JOURNEY_STAGES[idx - 1] : null;
  const next = idx < JOURNEY_STAGES.length - 1 ? JOURNEY_STAGES[idx + 1] : null;
  const stateLabel = stageStateLabel(stage.state, t);
  const label = t[stage.key];

  const badges = [
    { icon: "📚", label: t.explorePathBooksTemplate.replace("{count}", String(stage.books)) },
    { icon: "⏱", label: t.exploreHoursTemplate.replace("{count}", String(stage.hours)) },
    { icon: "🤖", label: t.exploreAiTutorLabel },
  ];
  if (stage.quiz) badges.push({ icon: "📝", label: t.exploreQuizLabel });

  let description = stateLabel;
  let primaryActions: DetailAction[] = [];
  const lists: DetailListSection[] = [];

  if (stage.state === "completed") {
    description = `${stateLabel} — ${t.explorePathBooksTemplate.replace("{count}", String(stage.books))}`;
    primaryActions = [
      { label: t.exploreActionReviewProgress, variant: "primary", href: "/my-space" },
      { label: t.exploreActionRevisitBooks, variant: "secondary", href: `/library?q=${encodeURIComponent(label)}` },
      { label: t.exploreActionRetakeQuiz, variant: "ghost", href: "/quiz" },
    ];
  } else if (stage.state === "current") {
    description = `${stateLabel} · ${t.explorePercentCompleteTemplate.replace("{percent}", String(CURRENT_STAGE_PERCENT))}`;
    primaryActions = [
      { label: t.exploreContinueReadingAction, variant: "primary", href: readingTargetHref },
      { label: t.exploreActionOpenAiTutor, variant: "secondary", href: "/ai-tutor" },
      { label: t.exploreActionViewBooks, variant: "ghost", href: `/library?q=${encodeURIComponent(label)}` },
    ];
  } else if (stage.state === "recommendedNext") {
    description = prev ? t.exploreJourneyRecommendReasonTemplate.replace("{stage}", t[prev.key]) : stateLabel;
    primaryActions = [
      { label: t.exploreActionStartStage, variant: "primary", href: readingTargetHref },
      { label: t.exploreActionOpenAiTutor, variant: "secondary", href: "/ai-tutor" },
      { label: t.exploreActionViewBooks, variant: "ghost", href: `/library?q=${encodeURIComponent(label)}` },
    ];
  } else {
    // locked / futureGoal — show prerequisites, never navigate directly.
    description = stateLabel;
    lists.push({ label: t.exploreLabelPrerequisites, items: JOURNEY_STAGES.slice(0, idx).map((s) => t[s.key]) });
  }

  const navActions: DetailAction[] = [];
  if (prev) navActions.push({ label: `${t.exploreLabelPreviousStage}: ${t[prev.key]}`, variant: "ghost", onClick: () => openDetail(buildJourneyStageDetail(prev, t, openDetail, readingTargetHref)) });
  if (next) navActions.push({ label: `${t.exploreLabelNextStage}: ${t[next.key]}`, variant: "ghost", onClick: () => openDetail(buildJourneyStageDetail(next, t, openDetail, readingTargetHref)) });

  return {
    kind: "learningPath",
    kindLabel: t.exploreDetailKindJourneyStage,
    icon: stage.icon,
    title: label,
    description,
    badges,
    lists,
    actions: [...primaryActions, ...navActions],
  };
}

// The compact "AI Learning Paths" entry point — same stage data, but a
// simpler state-agnostic action set (Start Stage / Open AI Tutor / View
// Books) per spec, distinct from Knowledge Journey 2.0's state-dependent
// detail above.
function buildPathStageDetailSimple(
  stage: typeof JOURNEY_STAGES[number],
  t: UIText,
  openDetail: (c: DetailContent) => void,
  readingTargetHref: string
): DetailContent {
  const idx = JOURNEY_STAGES.findIndex((s) => s.key === stage.key);
  const prev = idx > 0 ? JOURNEY_STAGES[idx - 1] : null;
  const next = idx < JOURNEY_STAGES.length - 1 ? JOURNEY_STAGES[idx + 1] : null;
  const stateLabel = stageStateLabel(stage.state, t);
  const label = t[stage.key];

  const badges = [
    { icon: "📚", label: t.explorePathBooksTemplate.replace("{count}", String(stage.books)) },
    { icon: "⏱", label: t.exploreHoursTemplate.replace("{count}", String(stage.hours)) },
    { icon: "🤖", label: t.exploreAiTutorLabel },
  ];
  if (stage.quiz) badges.push({ icon: "📝", label: t.exploreQuizLabel });

  let description = `${stateLabel} — ${t.explorePathBooksTemplate.replace("{count}", String(stage.books))} · ${t.exploreHoursTemplate.replace("{count}", String(stage.hours))}`;
  if (stage.state === "current") {
    description += ` · ${t.explorePercentCompleteTemplate.replace("{percent}", String(CURRENT_STAGE_PERCENT))}`;
  }

  const navActions: DetailAction[] = [];
  if (prev) navActions.push({ label: `${t.exploreLabelPreviousStage}: ${t[prev.key]}`, variant: "ghost", onClick: () => openDetail(buildPathStageDetailSimple(prev, t, openDetail, readingTargetHref)) });
  if (next) navActions.push({ label: `${t.exploreLabelNextStage}: ${t[next.key]}`, variant: "ghost", onClick: () => openDetail(buildPathStageDetailSimple(next, t, openDetail, readingTargetHref)) });

  return {
    kind: "learningPath",
    kindLabel: t.exploreDetailKindLearningPath,
    icon: stage.icon,
    title: label,
    description,
    badges,
    actions: [
      { label: t.exploreActionStartStage, variant: "primary", href: readingTargetHref },
      { label: t.exploreActionOpenAiTutor, variant: "secondary", href: "/ai-tutor" },
      { label: t.exploreActionViewBooks, variant: "ghost", href: `/library?q=${encodeURIComponent(label)}` },
      ...navActions,
    ],
  };
}

function buildCollectionDetail(c: { icon: string; titleKey: keyof UIText; descKey: keyof UIText }, t: UIText, catalog: CatalogBook[]): DetailContent {
  const label = t[c.titleKey];
  const books = pickRange(c.titleKey, 8, 40);
  const hours = pickRange(`${c.titleKey}::dur`, 4, 30);
  const difficulty = difficultyFor(c.titleKey, t);
  const included = catalog.slice(0, Math.min(3, catalog.length)).map((b) => b.title);
  const firstBook = catalog[0] ?? null;
  return {
    kind: "collection",
    kindLabel: t.exploreDetailKindCollection,
    icon: c.icon,
    title: label,
    description: t[c.descKey],
    badges: [
      { icon: "📚", label: t.explorePathBooksTemplate.replace("{count}", String(books)) },
      { icon: "⏱", label: t.exploreHoursTemplate.replace("{count}", String(hours)) },
      { icon: "🎓", label: difficulty },
      { icon: "🤖", label: t.exploreCollectionsAiTutorReady },
    ],
    lists: included.length > 0 ? [{ label: t.exploreLabelIncludedBooks, items: included }] : [],
    actions: [
      { label: t.exploreActionStartFirstBook, variant: "primary", href: firstBook ? `/reader-premium?book=${firstBook.id}` : "/library" },
      { label: t.exploreActionViewAllInLibrary, variant: "secondary", href: `/library?q=${encodeURIComponent(label)}` },
    ],
  };
}

function buildBookDetail(book: CatalogBook, t: UIText): DetailContent {
  const difficulty = difficultyFor(book.id, t);
  const hours = pickRange(`${book.id}::rec`, 3, 10);
  return {
    kind: "book",
    kindLabel: t.exploreDetailKindBook,
    icon: "📖",
    title: book.title,
    description: book.category ? t.exploreRecommendationReasonTemplate.replace("{topic}", book.category) : "",
    badges: [
      { icon: "📊", label: difficulty },
      { icon: "⏱", label: t.exploreHoursTemplate.replace("{count}", String(hours)) },
      { icon: "🤖", label: t.exploreAiTutorLabel },
    ],
    actions: [
      { label: t.exploreStartLearningCta, variant: "primary", href: `/reader-premium?book=${book.id}` },
      { label: t.exploreActionViewBookDetails, variant: "secondary", href: `/library?q=${encodeURIComponent(book.title)}` },
    ],
  };
}

export default function ExplorePage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const catalog = usePublicCatalog();

  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);

  // The one shared detail panel — every card/section that used to jump
  // straight to /library now opens its content here instead.
  const [detailContent, setDetailContent] = useState<DetailContent | null>(null);
  const openDetail = (content: DetailContent) => setDetailContent(content);
  const closeDetailPanel = () => setDetailContent(null);

  // Surprise Me — explicit idle/shuffling/result state machine. No
  // router navigation ever happens inside the shuffle timer; the result
  // stays on screen until the learner picks Try Again, Close, or one of
  // the recommendation's own actions.
  type SurpriseState = "idle" | "shuffling" | "result";
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");
  const [surpriseShuffleItem, setSurpriseShuffleItem] = useState<{ icon: string; label: string } | null>(null);
  const [surpriseResult, setSurpriseResult] = useState<DetailContent | null>(null);
  const shuffleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearShuffleTimer() {
    if (shuffleIntervalRef.current) {
      clearInterval(shuffleIntervalRef.current);
      shuffleIntervalRef.current = null;
    }
  }

  useEffect(() => {
    setProgress(readProgress());
    return () => clearShuffleTimer();
  }, []);

  const period = periodOfDay();
  const dailyBook = useMemo<CatalogBook | null>(() => {
    if (catalog.length === 0) return null;
    return catalog[dayIndex(catalog.length)];
  }, [catalog]);
  const dailyTopic = useMemo(() => {
    const topic = TRENDING_TOPICS[PERIOD_TOPIC_INDEX[period]];
    return topic ? t[topic.key] : "";
  }, [t, period]);
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

  // "Today's AI Learning Plan" — a guided routine, one card per step.
  // The first step points at whatever's actually in progress (or the
  // daily pick as a fallback); the rest point at real pages already in
  // the app (AI Tutor, Quiz, Revision, My Space), and the last step
  // scrolls down to the Recommendations section already on this page —
  // a small, honest way to make the "guided journey" loop back on
  // itself instead of dead-ending.
  const todaySteps = useMemo(() => {
    const readingTarget = continueLearning[0]?.book ?? dailyBook;
    return [
      { icon: "📖", label: t.exploreContinueReadingAction, href: readingTarget ? `/reader-premium?book=${readingTarget.id}` : "/library" },
      { icon: "🎥", label: t.exploreTodayStepWatchSummary, href: "/ai-tutor" },
      { icon: "📝", label: t.exploreTodayStepQuickQuiz, href: "/quiz" },
      { icon: "🧠", label: t.exploreTodayStepRevise, href: "/revision" },
      { icon: "⭐", label: t.exploreTodayStepStreak, href: "/my-space" },
      { icon: "🚀", label: t.exploreTodayStepUnlock, href: "#ai-recommendations" },
    ];
  }, [t, continueLearning, dailyBook]);

  // What "Start Stage" / "Continue Reading" inside a learning-path/
  // journey-stage detail actually opens — whatever's in progress, or
  // today's pick as a fallback, same book Continue Learning already uses.
  const readingTargetHref = useMemo(() => {
    const book = continueLearning[0]?.book ?? dailyBook;
    return book ? `/reader-premium?book=${book.id}` : "/library";
  }, [continueLearning, dailyBook]);

  // Surprise Me's pool spans every category the page itself links to —
  // "Book / Topic / Collection / Career / Learning Path" per spec. Each
  // entry lazily builds its full DetailContent only once picked, so the
  // rapid shuffle itself stays cheap (just swapping icon/label).
  const surprisePool = useMemo(() => {
    const pool: { icon: string; label: string; build: () => DetailContent }[] = [];
    TRENDING_TOPICS.forEach((topic) => pool.push({ icon: topic.icon, label: t[topic.key], build: () => buildTopicDetail(topic, t, catalog) }));
    JOURNEY_STAGES.forEach((stage) => pool.push({ icon: stage.icon, label: t[stage.key], build: () => buildJourneyStageDetail(stage, t, openDetail, readingTargetHref) }));
    CAREERS.forEach((career) => pool.push({ icon: career.icon, label: t[career.key], build: () => buildCareerDetail(career, t, openDetail, readingTargetHref) }));
    COLLECTIONS.forEach((c) => pool.push({ icon: c.icon, label: t[c.titleKey], build: () => buildCollectionDetail(c, t, catalog) }));
    catalog.forEach((book) => pool.push({ icon: "📖", label: book.title, build: () => buildBookDetail(book, t) }));
    return pool;
  }, [t, catalog, readingTargetHref]);

  // The one shuffle loop — 4 to 6 items at ~500ms each, then stop on a
  // single final recommendation and stay there. No router navigation
  // happens in here; the result is just state, shown inline until the
  // learner acts on it.
  function runShuffle() {
    clearShuffleTimer();
    setSurpriseResult(null);
    if (surprisePool.length === 0) return;
    setSurpriseState("shuffling");
    const totalTicks = 4 + Math.floor(Math.random() * 3);
    let ticks = 0;
    shuffleIntervalRef.current = setInterval(() => {
      const candidate = surprisePool[Math.floor(Math.random() * surprisePool.length)];
      setSurpriseShuffleItem({ icon: candidate.icon, label: candidate.label });
      ticks += 1;
      if (ticks >= totalTicks) {
        clearShuffleTimer();
        const finalPick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
        setSurpriseShuffleItem({ icon: finalPick.icon, label: finalPick.label });
        setSurpriseResult(finalPick.build());
        setSurpriseState("result");
      }
    }, 500);
  }
  function startSurprise() {
    if (surpriseState !== "idle") return;
    runShuffle();
  }
  function tryAgainSurprise() {
    runShuffle();
  }
  function closeSurprise() {
    clearShuffleTimer();
    setSurpriseState("idle");
    setSurpriseShuffleItem(null);
    setSurpriseResult(null);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} homeLabel={t.commonHome} />
        {/* "My AI Learning Coach" framing — a single, tasteful reminder
            that this page guides a learner's journey rather than just
            listing books, per spec's "Explore should feel like an AI
            Learning Coach." ────────────────────────────────────────── */}
        <p className="mb-2 -mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white">
          {t.exploreCoachTagline}
        </p>

        {/* ── ✨ Daily AI Discovery — the hero. One real book (deterministic
            "pick of the day") + a badge row that makes the recommendation
            feel personalized: time-of-day period, difficulty, estimated
            time, AI Tutor availability, and a Continue Learning callout
            when this happens to be a book the learner is already
            partway through. ────────────────────────────────────────── */}
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
                  <StatBadge tone="dark" icon={periodIcon(period)} label={periodLabel(period, t)} />
                  <StatBadge tone="dark" icon="📊" label={dailyDifficulty} />
                  <StatBadge tone="dark" icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(dailyHours))} />
                  <StatBadge tone="dark" icon="🤖" label={t.exploreAiTutorAvailableLabel} />
                  {isDailyBookContinuing && <StatBadge tone="dark" icon="🔄" label={t.exploreContinueLearningBadge} />}
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <AppButton href={`/reader-premium?book=${dailyBook.id}`} variant="accent" size="md">
                    🤖 {t.exploreDailyCta}
                  </AppButton>
                  <AppButton href="/ai-tutor" variant="secondary" size="md">
                    🤖 {t.exploreActionAskAiTutor}
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
            const trendPercent = pickRange(`${topic.key}::trend`, 8, 45);
            const recommended = hashSeed(topic.key) % 2 === 0;
            const learnersLabel = t.exploreLearnersTemplate.replace("{count}", learners.toLocaleString());
            const trendLabel = t.exploreTrendingUpTemplate.replace("{percent}", String(trendPercent));
            return (
              <button
                key={topic.key}
                type="button"
                onClick={() => openDetail(buildTopicDetail(topic, t, catalog))}
                aria-label={`${t[topic.key]} — ${t.exploreTrendingBadge}, ${trendLabel}, ${learnersLabel}${recommended ? `, ${t.exploreRecommendedBadge}` : ""}`}
                className="ndl-press relative flex w-full flex-col items-center gap-1.5 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                {recommended && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    {t.exploreRecommendedBadge}
                  </span>
                )}
                <span className="text-3xl" aria-hidden>{topic.icon}</span>
                <span className="text-sm font-bold text-slate-800 break-words">{t[topic.key]}</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-orange-600">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                  </span>
                  🔥 {t.exploreTrendingBadge}
                </span>
                <span className="text-[10px] font-bold tabular-nums text-emerald-600">{trendLabel}</span>
                <span className="text-[10px] font-medium tabular-nums text-slate-400">{learnersLabel}</span>
              </button>
            );
          })}
        </div>

        {/* ── 🎯 AI Learning Paths — the compact horizontal roadmap. Reuses
            JourneyStageCard(compact) so this and Knowledge Journey 2.0
            below share one stage renderer instead of two parallel
            copies. ─────────────────────────────────────────────────── */}
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
                  <JourneyStageCard
                    stage={stage}
                    t={t}
                    compact
                    onOpen={() => openDetail(buildPathStageDetailSimple(stage, t, openDetail, readingTargetHref))}
                  />
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

        {/* ── 📈 Overall Learning Progress (NEW) — a dashboard above
            Knowledge Journey 2.0, giving the coach framing something
            concrete to point at. Reuses StatCard for the three metrics
            that naturally fit its label+value shape; the completion
            counts use a lighter inline tile since their i18n copy is a
            full sentence rather than a bare number. ────────────────── */}
        <SectionHeading title={t.exploreProgressTitle} />
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <div className="mb-6">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700 ease-out"
                style={{ width: "63%" }}
                role="progressbar"
                aria-valuenow={63}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.explorePercentCompleteTemplate.replace("{percent}", "63")}
              />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-700">{t.explorePercentCompleteTemplate.replace("{percent}", "63")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-amber-50/70 px-4 py-4 text-center ring-1 ring-amber-100">
              <p className="text-sm font-black text-slate-900">{t.exploreProgressBooksCompletedTemplate.replace("{count}", "12")}</p>
            </div>
            <div className="rounded-2xl bg-amber-50/70 px-4 py-4 text-center ring-1 ring-amber-100">
              <p className="text-sm font-black text-slate-900">{t.exploreProgressQuizzesPassedTemplate.replace("{count}", "9")}</p>
            </div>
            <div className="rounded-2xl bg-amber-50/70 px-4 py-4 text-center ring-1 ring-amber-100">
              <p className="text-sm font-black text-slate-900">{t.exploreProgressPathsStartedTemplate.replace("{count}", "4")}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon="🎯" label={t.exploreStageCurrent} value={t[CURRENT_JOURNEY_STAGE.key]} />
            <StatCard icon="⏱️" label={t.exploreProgressAvgReadingLabel} value={t.exploreProgressMinutesTemplate.replace("{count}", "42")} />
            <StatCard icon="🔥" label={t.exploreProgressStreakLabel} value={t.exploreProgressDaysTemplate.replace("{count}", "11")} />
          </div>
        </div>

        {/* ── 🧠 Knowledge Journey 2.0 — the flagship "you are here"
            roadmap. Redesigned as a horizontal Microsoft-Learn/Coursera-
            style path (same six stages/shared data as AI Learning Paths
            above): full per-stage detail, an animated flowing connector
            between nodes, and distinct completed/current/recommended/
            locked colors (green/gold/blue-glow/grey). Falls back to a
            vertical stack below the `lg` breakpoint — full-detail cards
            need more room than the compact roadmap above, so the
            horizontal layout only kicks in once there's actually space
            for it; portrait phones and tablets get a clean vertical
            stack instead of a cramped horizontal squeeze. ───────────── */}
        <SectionHeading title={t.exploreJourneyTitle} subtitle={t.exploreJourneySubtitle} />
        <div id="ai-knowledge-journey" className="scroll-mt-24 rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
            {t.exploreDifficultyBeginner}
          </span>
          <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-stretch lg:gap-2">
            {JOURNEY_STAGES.map((stage, i) => (
              <div key={stage.key} className="flex min-w-0 flex-1 flex-col items-center lg:flex-row">
                <div className="w-full min-w-0">
                  <JourneyStageCard
                    stage={stage}
                    t={t}
                    onOpen={() => openDetail(buildJourneyStageDetail(stage, t, openDetail, readingTargetHref))}
                  />
                </div>
                {i < JOURNEY_STAGES.length - 1 && <FlowConnector animated />}
              </div>
            ))}
          </div>
        </div>

        {/* ── 💼 Explore by Career — real navigation, enhanced with demo
            recommended-books/duration/AI-tutor stats and a required-
            skills chip row. ────────────────────────────────────────── */}
        <SectionHeading title={t.exploreCareersTitle} subtitle={t.exploreCareersSubtitle} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAREERS.map((career) => {
            const books = pickRange(career.key, 20, 60);
            const hours = pickRange(`${career.key}::dur`, 40, 150);
            const skills = skillsFor(career.key, t);
            return (
              <button
                key={career.key}
                type="button"
                onClick={() => openDetail(buildCareerDetail(career, t, openDetail, readingTargetHref))}
                className="ndl-press flex w-full flex-col items-center gap-2 rounded-3xl bg-white px-4 py-6 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                <span className="text-3xl" aria-hidden>{career.icon}</span>
                <span className="text-sm font-bold text-slate-800 break-words">{t[career.key]}</span>
                <span className="text-[10px] font-bold text-amber-700">{t.exploreCareerRecommendedBooksTemplate.replace("{count}", String(books))}</span>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <StatBadge icon="🗺️" label={t.exploreCareerLearningPathAvailable} />
                  <StatBadge icon="🤖" label={t.exploreAiTutorLabel} />
                </div>
                <span className="text-[10px] text-slate-400">{t.exploreCareerAverageDurationLabel}: {t.exploreHoursTemplate.replace("{count}", String(hours))}</span>
                <div className="mt-1 w-full">
                  <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t.exploreCareerSkillsLabel}</p>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{skill}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── 🧠 Continue Learning — conditional: only when the user has
            real reading progress, never a demo fallback. Each card shows
            real last-opened/time-remaining data plus three ways back in
            — Continue Reading (primary, real), Resume AI Tutor, Resume
            Quiz (both real pages, an honest quick link rather than
            fabricated per-book resume state). ─────────────────────────── */}
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
                            <div className="h-full rounded-full bg-amber-500 transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-slate-500">{pct}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-400">
                      <span className="truncate">{t.exploreContinueLastOpenedLabel}: {formatLastOpened(p.lastReadAt, language)}</span>
                      <span className="truncate">{t.exploreContinueTimeRemainingLabel}: {formatRemaining(p, t)}</span>
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

        {/* ── 📅 Today's AI Learning Plan (NEW) — a guided daily routine,
            reusing the same FlowConnector as Knowledge Journey 2.0 so
            the "guided path" visual language stays consistent across
            the page instead of inventing a second connector style. ──── */}
        <SectionHeading title={t.exploreTodayTitle} subtitle={t.exploreTodaySubtitle} />
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 sm:p-8">
          <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-stretch lg:gap-2">
            {todaySteps.map((step, i) => (
              <div key={step.label} className="flex min-w-0 flex-1 flex-col items-center lg:flex-row">
                <Link
                  href={step.href}
                  className="ndl-press flex w-full min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-amber-50/70 px-3 py-4 text-center ring-1 ring-amber-100 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="text-2xl" aria-hidden>{step.icon}</span>
                  <span className="break-words text-xs font-bold text-slate-800 sm:text-sm">{step.label}</span>
                </Link>
                {i < todaySteps.length - 1 && <FlowConnector />}
              </div>
            ))}
          </div>
        </div>

        {/* ── 🤖 AI Recommendations For You — grounded in real catalog
            books (real covers, real reader links) with mocked
            difficulty/estimated-time metadata. ────────────────────────── */}
        {recommendations.length > 0 && (
          <>
            <SectionHeading
              title={t.exploreRecommendationsTitle}
              subtitle={t.exploreRecommendationsReasonTemplate.replace("{topic}", recommendationTopic)}
            />
            <div id="ai-recommendations" className="scroll-mt-24">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-amber-600">{t.exploreRecommendationsIntro}</p>
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
                          <StatBadge icon="🤖" label={t.exploreAiTutorLabel} />
                        </div>
                        <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
                          {t.exploreStartLearningCta}
                        </AppButton>
                        <AppButton href={`/library?q=${encodeURIComponent(book.title)}`} variant="secondary" size="sm" fullWidth>
                          {t.exploreActionViewBookDetails}
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── 📚 AI Curated Collections ─────────────────────────────────── */}
        <SectionHeading title={t.exploreCollectionsTitle} subtitle={t.exploreCollectionsSubtitle} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLLECTIONS.map((c) => {
            const books = pickRange(c.titleKey, 8, 40);
            const hours = pickRange(`${c.titleKey}::dur`, 4, 30);
            const difficulty = difficultyFor(c.titleKey, t);
            return (
              <button
                key={c.titleKey}
                type="button"
                onClick={() => openDetail(buildCollectionDetail(c, t, catalog))}
                className="ndl-press flex w-full flex-col gap-2 rounded-3xl bg-white p-6 text-left shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(75,45,12,0.14)]"
              >
                <span className="text-3xl" aria-hidden>{c.icon}</span>
                <h4 className="font-black text-slate-950 break-words">{t[c.titleKey]}</h4>
                <p className="text-sm text-slate-500">{t[c.descKey]}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatBadge icon="📚" label={t.explorePathBooksTemplate.replace("{count}", String(books))} />
                  <StatBadge icon="🤖" label={t.exploreCollectionsAiTutorReady} />
                  <StatBadge icon="⏱" label={t.exploreHoursTemplate.replace("{count}", String(hours))} />
                  <StatBadge icon="🎓" label={difficulty} />
                </div>
                <span className="mt-2 text-xs font-bold text-orange-600">{t.exploreExploreCollectionCta} →</span>
              </button>
            );
          })}
        </div>

        {/* ── 🎲 Surprise Me — one button; every click shuffles rapidly
            through 4-6 picks, then stops on ONE final recommendation
            shown as a full card right here on the page. Never navigates
            on its own — the learner picks Try Again, Close, or one of
            the recommendation's own actions. */}
        <section className="mt-10 mb-6">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-lg font-black text-slate-900">{t.exploreSurpriseTitle}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{t.exploreSurpriseSubtitle}</p>
            {surpriseState !== "result" && (
              <button
                type="button"
                onClick={startSurprise}
                disabled={surpriseState === "shuffling"}
                aria-label={t.exploreSurpriseButton}
                className="ndl-press mt-5 inline-flex items-center gap-2 rounded-full bg-orange-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(194,65,12,0.3)] hover:bg-orange-700 disabled:opacity-60"
              >
                🎲 {t.exploreSurpriseButton}
              </button>
            )}

            {surpriseState === "shuffling" && surpriseShuffleItem && (
              <div className="ndl-fade-in-scale mt-6 flex flex-col items-center gap-3" role="status" aria-live="polite">
                <div className="flex items-center gap-3 rounded-full bg-amber-50 px-6 py-3 ring-1 ring-amber-100">
                  <span className="motion-safe:animate-bounce text-2xl" aria-hidden>{surpriseShuffleItem.icon}</span>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">{t.exploreSurpriseFindingLabel}</p>
                    <p className="font-black text-slate-900 break-words">{surpriseShuffleItem.label}</p>
                  </div>
                </div>
              </div>
            )}

            {surpriseState === "result" && surpriseResult && (
              <div className="ndl-fade-in-scale mx-auto mt-6 max-w-md rounded-3xl bg-amber-50/60 p-6 text-left ring-1 ring-amber-100" role="status" aria-live="polite">
                <DetailPanelBody content={surpriseResult} />
                <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-100 pt-3">
                  <AppButton variant="secondary" size="sm" onClick={tryAgainSurprise}>
                    🔁 {t.exploreSurpriseTryAgain}
                  </AppButton>
                  <AppButton variant="ghost" size="sm" onClick={closeSurprise}>
                    {t.commonClose}
                  </AppButton>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      <ExploreDetailSheet content={detailContent} onClose={closeDetailPanel} t={t} />
      <AccessibilityToolbar />
    </main>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 mt-10">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500 break-words">{subtitle}</p>}
    </div>
  );
}

// Small icon+label pill, reused across every enhanced section (Daily
// Discovery, Learning Path/Journey stages, Career, Collections,
// Recommendations) instead of each section inventing its own badge
// markup.
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

// The connector between roadmap nodes — shared by Knowledge Journey 2.0
// and Today's AI Learning Plan instead of each section styling its own
// arrow/line. `animated` swaps the plain color-only bar for the
// flowing-gradient one (Journey 2.0's "you are on a path" signature;
// Today's Plan keeps the calmer static version since it's a routine
// checklist, not a multi-stage progression).
function FlowConnector({ animated }: { animated?: boolean }) {
  return (
    <span className="flex flex-shrink-0 items-center justify-center py-1 text-lg text-amber-400 lg:px-1" aria-hidden>
      <span className="lg:hidden">↓</span>
      <span className={`hidden h-1 w-6 rounded-full lg:block ${animated ? "ndl-connector-flow" : "bg-amber-200"}`} />
    </span>
  );
}

// The one stage-card renderer shared by both the compact horizontal "AI
// Learning Paths" roadmap and the full "Knowledge Journey 2.0" —
// `compact` hides the stat badges and shrinks padding, everything else
// (state styling, checkmark/current-stage treatment) is identical
// between the two views. Every stage opens its detail in-page via
// `onOpen` rather than jumping straight to Library — locked/future
// stages are simply styled as muted rather than disabled, so the
// roadmap never becomes a dead end. State colors: completed=green,
// current=gold (pulsing ring), recommended=blue (pulsing glow),
// locked/future=grey.
function JourneyStageCard({
  stage, t, compact, onOpen,
}: {
  stage: typeof JOURNEY_STAGES[number];
  t: UIText;
  compact?: boolean;
  onOpen: () => void;
}) {
  const isCompleted = stage.state === "completed";
  const isCurrent = stage.state === "current";
  const isRecommended = stage.state === "recommendedNext";
  const isMuted = stage.state === "locked" || stage.state === "futureGoal";
  const stateLabel = stageStateLabel(stage.state, t);

  const stateTextClass =
    isCompleted ? "text-emerald-600" :
    isCurrent ? "text-amber-600" :
    isRecommended ? "text-blue-600" :
    "text-slate-400";

  const cardClass = `w-full min-w-0 rounded-2xl ring-1 transition ${compact ? "p-2.5" : "p-3.5"} ${
    isCurrent ? "ndl-current-stage bg-amber-50 ring-amber-300" :
    isCompleted ? "bg-emerald-50/70 ring-emerald-100" :
    isRecommended ? "ndl-recommended-glow bg-blue-50 ring-blue-300" :
    isMuted ? "bg-slate-50 opacity-60 ring-slate-100" :
    "bg-white ring-slate-100 hover:-translate-y-0.5 hover:shadow-md"
  }`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`ndl-press text-left ${cardClass}`}
      aria-label={`${t[stage.key]} — ${stateLabel}${isCurrent ? `, ${t.explorePercentCompleteTemplate.replace("{percent}", String(CURRENT_STAGE_PERCENT))}` : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-lg ${
            isCompleted ? "bg-emerald-100" : isCurrent ? "bg-amber-100" : isRecommended ? "bg-blue-100" : "bg-slate-100"
          }`}
          aria-hidden
        >
          {isCompleted ? "✅" : isCurrent ? "🟡" : isRecommended ? "⭐" : stage.state === "locked" ? "🔒" : stage.icon}
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
    </button>
  );
}

// ── DetailPanelBody — the one content renderer shared by BOTH the
// ExploreDetailSheet modal AND the inline Surprise Me result card, so
// there is exactly one place that lays out kind/title/description/
// badges/lists/actions instead of duplicating that JSX per surface.
function DetailPanelBody({ content, onNavigate }: { content: DetailContent; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-2xl ring-1 ring-amber-100" aria-hidden>
          {content.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">{content.kindLabel}</p>
          <h3 className="mt-0.5 text-lg font-black text-slate-950 break-words">{content.title}</h3>
        </div>
      </div>
      {content.description && <p className="text-sm text-slate-600 break-words">{content.description}</p>}
      {content.badges && content.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {content.badges.map((b, i) => (
            <StatBadge key={i} icon={b.icon} label={b.label} />
          ))}
        </div>
      )}
      {content.lists?.map((list) => (
        <div key={list.label}>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{list.label}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {list.items.map((item) => (
              <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 break-words">
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
      {content.actions.length > 0 && (
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {content.actions.map((action, i) => (
            <DetailActionButton key={i} action={action} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailActionButton({ action, onNavigate }: { action: DetailAction; onNavigate?: () => void }) {
  const variant = action.variant ?? "secondary";
  if (action.href) {
    return (
      <AppButton
        href={action.href}
        variant={variant}
        size="sm"
        onClick={() => {
          action.onClick?.();
          onNavigate?.();
        }}
      >
        {action.label}
      </AppButton>
    );
  }
  return (
    <AppButton type="button" variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </AppButton>
  );
}

// Desktop: centered modal. Mobile: full-width bottom sheet. Escape and
// backdrop click both close; the close button receives focus on open.
function ExploreDetailSheet({ content, onClose, t }: { content: DetailContent | null; onClose: () => void; t: UIText }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!content) return;
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label={t.commonClose} onClick={onClose} className="absolute inset-0 bg-slate-950/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        className="ndl-fade-in-scale relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-8"
      >
        <div className="mb-2 flex items-center justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t.commonClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>
        <DetailPanelBody content={content} onNavigate={onClose} />
      </div>
    </div>
  );
}
