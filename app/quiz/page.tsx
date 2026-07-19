"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";

// Widened to plain `string` per key (rather than the literal English
// values `typeof UI_TEXT.en` would infer) so this type accepts `t` for
// any of the six languages, not just English.
type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import { trackAIUsage, logActivity } from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import LearningNav from "@/components/learning/LearningNav";
import ReturnToBook from "@/components/learning/ReturnToBook";
import InfoCard from "@/components/ui/InfoCard";
import FilterBar from "@/components/ui/FilterBar";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// ══════════════════════════════════════════════════════════════════════
// Data layer — read-only, mirrors Reader/Study Workspace shapes. Not
// imported from those modules; only the same localStorage keys are read,
// and nothing here writes to ndl_highlights/ndl_notes/ndl_ai_notes.
// ══════════════════════════════════════════════════════════════════════
interface StoredHighlightLite { id: string; bookId: string; page: number; selectedText: string; createdAt: number; [k: string]: any; }
interface StoredNoteLite { id: string; bookId: string; page: number; selectedText: string; note: string; createdAt: number; [k: string]: any; }
interface LegacyNote { id: string; bookTitle: string; chapter?: string; text: string; createdAt: string; }
type DirectorBook = { id: string; title: string; [k: string]: any };

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function findBookTitle(bookId: string): string {
  return (directorBooks as DirectorBook[]).find(b => b.id === bookId)?.title ?? bookId;
}
function truncate(s: string, n: number) {
  const clean = s.trim();
  return clean.length > n ? clean.slice(0, n).trimEnd() + "…" : clean;
}
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface StudyItem {
  id: string;
  bookId?: string;
  bookTitle: string;
  page?: number;
  text: string;
  origin: "highlight" | "note" | "legacy";
}

function buildStudyItems(highlights: StoredHighlightLite[], notes: StoredNoteLite[], legacy: LegacyNote[]): StudyItem[] {
  const fromHighlights: StudyItem[] = highlights
    .filter(h => h.selectedText?.trim().length > 15)
    .map(h => ({ id: `h-${h.id}`, bookId: h.bookId, bookTitle: findBookTitle(h.bookId), page: h.page, text: h.selectedText, origin: "highlight" }));
  const fromNotes: StudyItem[] = notes
    .filter(n => (n.note || n.selectedText)?.trim().length > 15)
    .map(n => ({ id: `n-${n.id}`, bookId: n.bookId, bookTitle: findBookTitle(n.bookId), page: n.page, text: n.selectedText, origin: "note" }));
  const fromLegacy: StudyItem[] = legacy
    .filter(n => n.text?.trim().length > 15)
    // Legacy notes have no real bookId (pre-dates the Reader's catalog),
    // so they can never match a "Current Book" filter by id — they only
    // ever show up under "Entire Study Material" / "Notes" sources.
    .map(n => ({ id: `legacy-${n.id}`, bookTitle: n.bookTitle, text: n.text, origin: "legacy" }));
  return [...fromHighlights, ...fromNotes, ...fromLegacy];
}

// ══════════════════════════════════════════════════════════════════════
// Question model + deterministic (non-AI) generation. Quiz *content* is
// built entirely client-side from real study data — instant, reliable,
// always scoreable. AI is used specifically (and only) for explaining
// wrong answers afterward — a much more robust use of a free-text model
// than trying to parse AI-generated quiz JSON.
// ══════════════════════════════════════════════════════════════════════
type Difficulty = "easy" | "medium" | "hard";
type QuizSourceKey = "current" | "highlights" | "notes" | "all";

interface MCQQuestion { id: string; type: "mcq"; prompt: string; options: string[]; correctIndex: number; item: StudyItem; }
interface TrueFalseQuestion { id: string; type: "truefalse"; prompt: string; correctAnswer: boolean; item: StudyItem; }
interface FillBlankQuestion { id: string; type: "fillblank"; before: string; after: string; correctAnswer: string; item: StudyItem; }
interface MatchQuestion { id: string; type: "match"; pairs: { left: string; right: string }[]; shuffledRight: string[]; item: StudyItem; }
type Question = MCQQuestion | TrueFalseQuestion | FillBlankQuestion | MatchQuestion;

function makeMCQ(item: StudyItem, pool: StudyItem[]): MCQQuestion | null {
  const others = shuffle(pool.filter(p => p.id !== item.id && p.text !== item.text)).slice(0, 3);
  if (others.length < 2) return null;
  const correctText = truncate(item.text, 100);
  const optionTexts = shuffle([correctText, ...others.map(o => truncate(o.text, 100))]);
  const correctIndex = optionTexts.indexOf(correctText);
  return {
    id: `mcq-${item.id}`, type: "mcq",
    prompt: `Which passage below is from "${item.bookTitle}"${item.page ? ` (page ${item.page})` : ""}?`,
    options: optionTexts, correctIndex, item,
  };
}

function makeTrueFalse(item: StudyItem, pool: StudyItem[]): TrueFalseQuestion | null {
  const isTrue = Math.random() < 0.5;
  if (isTrue) {
    return {
      id: `tf-${item.id}`, type: "truefalse",
      prompt: `True or False: this passage is from "${item.bookTitle}".\n\n“${truncate(item.text, 160)}”`,
      correctAnswer: true, item,
    };
  }
  const others = shuffle(pool.filter(p => p.bookTitle !== item.bookTitle));
  if (others.length === 0) return null;
  return {
    id: `tf-${item.id}`, type: "truefalse",
    prompt: `True or False: this passage is from "${others[0].bookTitle}".\n\n“${truncate(item.text, 160)}”`,
    correctAnswer: false, item,
  };
}

function makeFillBlank(item: StudyItem): FillBlankQuestion | null {
  const words = item.text.split(/\s+/);
  const candidates = words.filter(w => w.replace(/[^a-zA-Z]/g, "").length >= 5);
  if (candidates.length === 0) return null;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const idx = item.text.indexOf(chosen);
  if (idx === -1) return null;
  const cleanAnswer = chosen.replace(/[^a-zA-Z0-9]/g, "");
  if (!cleanAnswer) return null;
  return {
    id: `fb-${item.id}`, type: "fillblank",
    before: item.text.slice(0, idx), after: item.text.slice(idx + chosen.length),
    correctAnswer: cleanAnswer, item,
  };
}

function makeMatch(items: StudyItem[]): MatchQuestion | null {
  if (items.length < 3) return null;
  const chosen = shuffle(items).slice(0, Math.min(4, items.length));
  const pairs = chosen.map(i => ({
    left: `${i.bookTitle}${i.page ? ` · p.${i.page}` : ""}`,
    right: truncate(i.text, 70),
  }));
  return {
    id: `match-${chosen.map(c => c.id).join("-")}`, type: "match",
    pairs, shuffledRight: shuffle(pairs.map(p => p.right)), item: chosen[0],
  };
}

const DIFFICULTY_MIX: Record<Difficulty, { mcq: number; tf: number; fb: number; match: number }> = {
  easy:   { mcq: 5, tf: 0, fb: 0, match: 0 },
  medium: { mcq: 4, tf: 3, fb: 2, match: 0 },
  hard:   { mcq: 3, tf: 2, fb: 2, match: 2 },
};

function buildQuiz(pool: StudyItem[], difficulty: Difficulty): Question[] {
  const items = shuffle(pool);
  const mix = DIFFICULTY_MIX[difficulty];
  const questions: Question[] = [];
  let cursor = 0;
  const next = () => items[cursor++];

  for (let i = 0; i < mix.mcq; i++) { const it = next(); if (!it) break; const q = makeMCQ(it, pool); if (q) questions.push(q); }
  for (let i = 0; i < mix.tf; i++) { const it = next(); if (!it) break; const q = makeTrueFalse(it, pool); if (q) questions.push(q); }
  for (let i = 0; i < mix.fb; i++) { const it = next(); if (!it) break; const q = makeFillBlank(it); if (q) questions.push(q); }
  for (let i = 0; i < mix.match; i++) { const remaining = items.slice(cursor, cursor + 4); cursor += remaining.length; const q = makeMatch(remaining); if (q) questions.push(q); }

  return shuffle(questions);
}

// ── Polished demo quiz — always available, used when real study data is
// empty OR too sparse to build a coherent quiz from. ────────────────────
const DEMO_QUESTIONS: Question[] = [
  {
    id: "demo-mcq-1", type: "mcq",
    prompt: "Which of these best describes a qubit?",
    options: [
      "A bit that can exist in a superposition of 0 and 1",
      "A faster version of a classical transistor",
      "A unit of PDF page rendering speed",
      "A type of database index",
    ],
    correctIndex: 0,
    item: { id: "demo-1", bookTitle: "Quantum Computing", page: 42, text: "A qubit can exist in a superposition of the |0⟩ and |1⟩ states simultaneously.", origin: "highlight" },
  },
  {
    id: "demo-tf-1", type: "truefalse",
    prompt: "True or False: Nalanda was one of the world's first residential universities.\n\n“Nalanda was one of the world's first residential universities, attracting scholars from across Asia.”",
    correctAnswer: true,
    item: { id: "demo-2", bookTitle: "Nalanda: The Untold Story", page: 12, text: "Nalanda was one of the world's first residential universities.", origin: "highlight" },
  },
  {
    id: "demo-fb-1", type: "fillblank",
    before: "Chandrayaan-3's lander used a combination of laser and camera-based ",
    after: " detection during descent.",
    correctAnswer: "hazard",
    item: { id: "demo-3", bookTitle: "Chandrayaan 3", page: 8, text: "Chandrayaan-3's lander used a combination of laser and camera-based hazard detection during descent.", origin: "note" },
  },
  {
    id: "demo-match-1", type: "match",
    pairs: [
      { left: "Quantum Computing · p.42", right: "Superposition of |0⟩ and |1⟩" },
      { left: "Nalanda: The Untold Story · p.12", right: "One of the world's first residential universities" },
      { left: "Chandrayaan 3 · p.8", right: "Laser and camera-based hazard detection" },
    ],
    shuffledRight: shuffle([
      "Superposition of |0⟩ and |1⟩",
      "One of the world's first residential universities",
      "Laser and camera-based hazard detection",
    ]),
    item: { id: "demo-3", bookTitle: "Chandrayaan 3", page: 8, text: "", origin: "note" },
  },
];

// ── Answer storage + scoring ─────────────────────────────────────────
type Answer =
  | { type: "mcq"; selectedIndex: number | null }
  | { type: "truefalse"; selected: boolean | null }
  | { type: "fillblank"; value: string }
  | { type: "match"; selections: (string | null)[] };

function emptyAnswer(q: Question): Answer {
  if (q.type === "mcq") return { type: "mcq", selectedIndex: null };
  if (q.type === "truefalse") return { type: "truefalse", selected: null };
  if (q.type === "fillblank") return { type: "fillblank", value: "" };
  return { type: "match", selections: q.pairs.map(() => null) };
}

function isCorrect(q: Question, a: Answer): boolean {
  if (q.type === "mcq" && a.type === "mcq") return a.selectedIndex === q.correctIndex;
  if (q.type === "truefalse" && a.type === "truefalse") return a.selected === q.correctAnswer;
  if (q.type === "fillblank" && a.type === "fillblank") return a.value.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
  if (q.type === "match" && a.type === "match") return q.pairs.every((p, i) => a.selections[i] === p.right);
  return false;
}

// ══════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════
type Stage = "setup" | "taking" | "results";
const TIMER_SECONDS_PER_QUESTION = 30;

export default function QuizPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [mounted, setMounted] = useState(false);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<LegacyNote[]>([]);

  useEffect(() => {
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setLegacyNotes(readArray<LegacyNote>("ndl_ai_notes"));
    setMounted(true);
  }, []);

  const studyItems = useMemo(() => buildStudyItems(highlights, notes, legacyNotes), [highlights, notes, legacyNotes]);
  // "Current Book" choices come from the full catalog (lib/directorBooks.ts)
  // — every demo/library book, always — NOT just books that happen to
  // already have highlights/notes. A book with no stored study data yet
  // is still selectable; poolForSource() below will just come back empty
  // for it, and startQuiz()'s existing "< 3 questions → demo fallback"
  // logic already handles that gracefully (using book metadata/demo
  // fallback rather than an empty or broken quiz).
  const catalogBooks = directorBooks as DirectorBook[];

  // ── Setup state ───────────────────────────────────────────────────
  const [sourceKey, setSourceKey] = useState<QuizSourceKey>("all");
  // Tracked by real book id (matches /reader-premium?book=<id>), not by
  // title — titles aren't guaranteed unique and legacy notes don't carry
  // an id at all, so id is the only reliable key here.
  const [currentBookId, setCurrentBookId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timerEnabled, setTimerEnabled] = useState(false);

  // ── Quiz session state ───────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("setup");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [cursor, setCursor] = useState(0);
  const [usingDemo, setUsingDemo] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS_PER_QUESTION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explaining, setExplaining] = useState<string | null>(null);

  function poolForSource(): StudyItem[] {
    if (sourceKey === "highlights") return studyItems.filter(i => i.origin === "highlight");
    if (sourceKey === "notes") return studyItems.filter(i => i.origin === "note" || i.origin === "legacy");
    if (sourceKey === "current") {
      const chosenId = currentBookId || catalogBooks[0]?.id;
      return studyItems.filter(i => i.bookId === chosenId);
    }
    return studyItems;
  }

  function startQuiz(customQuestions?: Question[]) {
    let built = customQuestions ?? buildQuiz(poolForSource(), difficulty);
    let demo = false;
    if (built.length < 3) {
      built = shuffle(DEMO_QUESTIONS);
      demo = true;
    }
    setQuestions(built);
    setAnswers(built.map(emptyAnswer));
    setUsingDemo(demo);
    setCursor(0);
    setExplanations({});
    setStage("taking");
    setSecondsLeft(TIMER_SECONDS_PER_QUESTION);
  }

  // ── Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== "taking" || !timerEnabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setSecondsLeft(TIMER_SECONDS_PER_QUESTION);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          goNext();
          return TIMER_SECONDS_PER_QUESTION;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, timerEnabled, cursor]);

  function updateAnswer(index: number, answer: Answer) {
    setAnswers(prev => prev.map((a, i) => (i === index ? answer : a)));
  }

  function goNext() { setCursor(c => Math.min(questions.length - 1, c + 1)); }
  function goPrev() { setCursor(c => Math.max(0, c - 1)); }

  function submitQuiz() {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage("results");
  }

  const score = useMemo(
    () => questions.reduce((acc, q, i) => acc + (isCorrect(q, answers[i]) ? 1 : 0), 0),
    [questions, answers]
  );
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  function retryIncorrect() {
    const wrongQuestions = questions.filter((q, i) => !isCorrect(q, answers[i]));
    if (wrongQuestions.length === 0) return;
    startQuiz(wrongQuestions);
  }

  async function explainAnswer(q: Question) {
    setExplaining(q.id);
    try {
      const correctDescription =
        q.type === "mcq" ? q.options[q.correctIndex]
        : q.type === "truefalse" ? String(q.correctAnswer)
        : q.type === "fillblank" ? q.correctAnswer
        : q.pairs.map(p => `${p.left} → ${p.right}`).join("; ");

      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `A student answered this quiz question incorrectly. Question: "${questionSummary(q)}". The correct answer is: "${correctDescription}". Briefly explain in simple terms why this is correct. Respond in 2-3 sentences.`,
          book: q.item.bookTitle,
          chapter: "Quiz Explanation",
          content: q.item.text || questionSummary(q),
        }),
      });
      const data = await res.json();
      setExplanations(prev => ({ ...prev, [q.id]: data.answer || t.quizNoExplanationAvailable }));
      trackAIUsage("explain");
      logActivity("ai", `AI explained a quiz answer for "${q.item.bookTitle}"`);
    } catch {
      setExplanations(prev => ({ ...prev, [q.id]: t.quizExplanationFetchError }));
    } finally {
      setExplaining(null);
    }
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-4xl animate-pulse text-sm font-semibold text-slate-400">
          {t.quizLoadingWorkspace}
        </div>
      </main>
    );
  }

  const current = questions[cursor];
  const currentAnswer = answers[cursor];

  const sourceOptions: { key: QuizSourceKey; label: string }[] = [
    { key: "all", label: t.quizSourceAll },
    { key: "highlights", label: t.quizSourceHighlights },
    { key: "notes", label: t.quizSourceNotes },
    { key: "current", label: t.quizSourceCurrent },
  ];
  const difficultyOptions: { key: Difficulty; label: string }[] = [
    { key: "easy", label: t.quizDifficultyEasy },
    { key: "medium", label: t.quizDifficultyMedium },
    { key: "hard", label: t.quizDifficultyHard },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title={t.quizPageTitle}
          subtitle={t.quizPageSubtitle}
          homeLabel={t.commonHome}
        />

        <LearningNav />
        <ReturnToBook />

        {/* ── SETUP ─────────────────────────────────────────────────── */}
        {stage === "setup" && (
          <InfoCard className="p-8">
            {studyItems.length === 0 && (
              <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
                {t.quizNoStudyDataBanner}
              </InfoCard>
            )}

            <h2 className="text-lg font-black text-slate-950">{t.quizSourceLabel}</h2>
            <div className="mt-3">
              <FilterBar options={sourceOptions} active={sourceKey} onChange={setSourceKey} />
            </div>
            {sourceKey === "current" && catalogBooks.length > 0 && (
              <>
                <select
                  value={currentBookId || catalogBooks[0].id}
                  onChange={(e) => setCurrentBookId(e.target.value)}
                  className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {catalogBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
                {studyItems.filter(i => i.bookId === (currentBookId || catalogBooks[0].id)).length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {t.quizNoDataForBook}
                  </p>
                )}
              </>
            )}

            <h2 className="mt-8 text-lg font-black text-slate-950">{t.quizDifficultyLabel}</h2>
            <div className="mt-3">
              <FilterBar options={difficultyOptions} active={difficulty} onChange={setDifficulty} />
            </div>

            <label className="mt-8 flex items-center gap-3">
              <input type="checkbox" checked={timerEnabled} onChange={(e) => setTimerEnabled(e.target.checked)} className="h-5 w-5 rounded accent-amber-500" />
              <span className="text-sm font-semibold text-slate-700">
                {t.quizTimerLabel.replace("{seconds}", String(TIMER_SECONDS_PER_QUESTION))}
              </span>
            </label>

            <button
              onClick={() => startQuiz()}
              className="mt-8 w-full rounded-2xl bg-orange-600 px-8 py-4 text-lg font-bold text-white shadow-md shadow-orange-500/25 hover:bg-orange-700"
            >
              {t.quizStartButton}
            </button>
          </InfoCard>
        )}

        {/* ── TAKING ────────────────────────────────────────────────── */}
        {stage === "taking" && current && (
          <div>
            {usingDemo && (
              <InfoCard tone="amber" className="mb-4 py-3 text-sm font-semibold">
                {t.quizDemoBanner}
              </InfoCard>
            )}
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{t.quizQuestionLabel} {cursor + 1} {t.commonOf} {questions.length}</span>
              {timerEnabled && (
                <span className={`rounded-full px-3 py-1 ${secondsLeft <= 10 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  ⏱ {secondsLeft}s
                </span>
              )}
            </div>

            <InfoCard className="p-8">
              <p className="text-xs font-semibold text-slate-400">📖 {current.item.bookTitle}{current.item.page ? ` · ${t.commonPage} ${current.item.page}` : ""}</p>

              <QuestionBody
                question={current}
                answer={currentAnswer}
                onChange={(a) => updateAnswer(cursor, a)}
                t={t}
              />
            </InfoCard>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button onClick={goPrev} disabled={cursor === 0} className="rounded-full bg-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-30">
                ← {t.commonPrevious}
              </button>
              {cursor < questions.length - 1 ? (
                <button onClick={goNext} className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                  {t.commonNext} →
                </button>
              ) : (
                <button onClick={submitQuiz} className="rounded-full bg-orange-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-orange-700">
                  {t.quizSubmit}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────── */}
        {stage === "results" && (
          <div>
            <InfoCard tone="dark" className="p-8 text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">{t.quizYourScore}</p>
              <h2 className="mt-2 text-5xl font-black">{score} / {questions.length}</h2>
              <p className="mt-2 text-lg font-bold text-amber-400">{percentage}%</p>
            </InfoCard>

            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => startQuiz()} className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                {t.quizGenerateNew}
              </button>
              {score < questions.length && (
                <button onClick={retryIncorrect} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                  {t.quizRetryIncorrect}
                </button>
              )}
              <button onClick={() => setStage("setup")} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                {t.quizChangeSettings}
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {questions.map((q, i) => {
                const correct = isCorrect(q, answers[i]);
                return (
                  <div key={q.id} className={`rounded-3xl bg-white p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ${correct ? "ring-emerald-200" : "ring-red-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-400">📖 {q.item.bookTitle}{q.item.page ? ` · ${t.commonPage} ${q.item.page}` : ""}</p>
                      <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold ${correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {correct ? `✓ ${t.quizCorrectLabel}` : `✗ ${t.quizWrongLabel}`}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-line font-semibold text-slate-900">{questionSummary(q)}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t.quizCorrectAnswerLabel} <span className="font-bold">{correctAnswerLabel(q, t.commonTrue, t.commonFalse)}</span>
                    </p>

                    {!correct && (
                      <div className="mt-3">
                        {!explanations[q.id] ? (
                          <button
                            onClick={() => explainAnswer(q)}
                            disabled={explaining === q.id}
                            className="rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                          >
                            {explaining === q.id ? t.quizThinking : t.quizAiExplanation}
                          </button>
                        ) : (
                          <p className="rounded-2xl bg-blue-50 p-3 text-sm text-blue-900">{explanations[q.id]}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <AccessibilityToolbar />
    </main>
  );
}

// ── Per-type summary/answer-label helpers (results screen) ───────────
function questionSummary(q: Question): string {
  if (q.type === "mcq") return q.prompt;
  if (q.type === "truefalse") return q.prompt;
  if (q.type === "fillblank") return `${q.before}____${q.after}`;
  return q.pairs.map(p => p.left).join(" · ");
}
function correctAnswerLabel(q: Question, trueLabel: string, falseLabel: string): string {
  if (q.type === "mcq") return q.options[q.correctIndex];
  if (q.type === "truefalse") return q.correctAnswer ? trueLabel : falseLabel;
  if (q.type === "fillblank") return q.correctAnswer;
  return q.pairs.map(p => `${p.left} → ${p.right}`).join("; ");
}

// ── Per-type question renderer (taking screen) ─────────────────────────
function QuestionBody({ question, answer, onChange, t }: { question: Question; answer: Answer; onChange: (a: Answer) => void; t: UIText }) {
  if (question.type === "mcq" && answer.type === "mcq") {
    return (
      <div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{question.prompt}</h2>
        <div className="mt-5 flex flex-col gap-2">
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onChange({ type: "mcq", selectedIndex: i })}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                answer.selectedIndex === i ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "truefalse" && answer.type === "truefalse") {
    return (
      <div>
        <h2 className="mt-3 whitespace-pre-line text-xl font-bold text-slate-900">{question.prompt}</h2>
        <div className="mt-5 flex gap-3">
          {[true, false].map(v => (
            <button
              key={String(v)}
              onClick={() => onChange({ type: "truefalse", selected: v })}
              className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
                answer.selected === v ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {v ? t.commonTrue : t.commonFalse}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "fillblank" && answer.type === "fillblank") {
    return (
      <div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">
          {question.before}
          <input
            value={answer.value}
            onChange={(e) => onChange({ type: "fillblank", value: e.target.value })}
            placeholder="____"
            className="mx-1 inline-block w-40 rounded-lg border-b-2 border-blue-500 bg-blue-50 px-2 py-1 text-center text-lg font-bold text-blue-900 outline-none"
          />
          {question.after}
        </h2>
      </div>
    );
  }

  if (question.type === "match" && answer.type === "match") {
    return (
      <div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{t.quizMatchTheFollowing}</h2>
        <div className="mt-5 flex flex-col gap-3">
          {question.pairs.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{p.left}</span>
              <select
                value={answer.selections[i] ?? ""}
                onChange={(e) => {
                  const next = [...answer.selections];
                  next[i] = e.target.value || null;
                  onChange({ type: "match", selections: next });
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="">{t.quizChooseMatch}</option>
                {question.shuffledRight.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
