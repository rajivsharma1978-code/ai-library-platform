"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";

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
  const isEn = t.navLibrary === "Library";

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
      setExplanations(prev => ({ ...prev, [q.id]: data.answer || (isEn ? "No explanation available." : "कोई स्पष्टीकरण उपलब्ध नहीं।") }));
    } catch {
      setExplanations(prev => ({ ...prev, [q.id]: isEn ? "Could not fetch an explanation right now." : "अभी स्पष्टीकरण प्राप्त नहीं हो सका।" }));
    } finally {
      setExplaining(null);
    }
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl animate-pulse text-sm font-semibold text-slate-400">
          {isEn ? "Loading quiz workspace…" : "क्विज़ वर्कस्पेस लोड हो रहा है…"}
        </div>
      </main>
    );
  }

  const current = questions[cursor];
  const currentAnswer = answers[cursor];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">{isEn ? "Quiz" : "क्विज़"}</h1>
            <p className="mt-2 text-slate-600">
              {isEn ? "A premium AI-powered assessment, built from your study material." : "आपकी अध्ययन सामग्री से बना एक प्रीमियम एआई-संचालित मूल्यांकन।"}
            </p>
          </div>
          <Link href="/" className="rounded-xl bg-black px-4 py-2 text-white">{isEn ? "← Home" : "← होम"}</Link>
        </div>

        {/* ── SETUP ─────────────────────────────────────────────────── */}
        {stage === "setup" && (
          <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-black/5">
            {studyItems.length === 0 && (
              <div className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                {isEn
                  ? "📌 No study data yet — Start Quiz will show a polished demo quiz. Highlight text or add notes in the Reader to build your own."
                  : "📌 अभी तक कोई अध्ययन डेटा नहीं — क्विज़ शुरू करने पर डेमो क्विज़ दिखेगा। अपनी खुद की सामग्री बनाने के लिए रीडर में हाइलाइट करें या नोट्स जोड़ें।"}
              </div>
            )}

            <h2 className="text-lg font-black text-slate-900">{isEn ? "Quiz Source" : "क्विज़ स्रोत"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["all", isEn ? "📚 Entire Study Material" : "📚 संपूर्ण अध्ययन सामग्री"],
                ["highlights", isEn ? "⭐ Highlights" : "⭐ हाइलाइट्स"],
                ["notes", isEn ? "📝 Notes" : "📝 नोट्स"],
                ["current", isEn ? "📖 Current Book" : "📖 वर्तमान पुस्तक"],
              ] as [QuizSourceKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSourceKey(key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    sourceKey === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {sourceKey === "current" && catalogBooks.length > 0 && (
              <>
                <select
                  value={currentBookId || catalogBooks[0].id}
                  onChange={(e) => setCurrentBookId(e.target.value)}
                  className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none"
                >
                  {catalogBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
                {studyItems.filter(i => i.bookId === (currentBookId || catalogBooks[0].id)).length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {isEn
                      ? "No highlights or notes for this book yet — Start Quiz will use its description and a demo fallback."
                      : "इस किताब के लिए अभी तक कोई हाइलाइट या नोट्स नहीं — क्विज़ इसके विवरण और डेमो फ़ॉलबैक का उपयोग करेगी।"}
                  </p>
                )}
              </>
            )}

            <h2 className="mt-8 text-lg font-black text-slate-900">{isEn ? "Difficulty" : "कठिनाई"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["easy", isEn ? "🟢 Easy" : "🟢 आसान"],
                ["medium", isEn ? "🟡 Medium" : "🟡 मध्यम"],
                ["hard", isEn ? "🔴 Hard" : "🔴 कठिन"],
              ] as [Difficulty, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDifficulty(key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    difficulty === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-8 flex items-center gap-3">
              <input type="checkbox" checked={timerEnabled} onChange={(e) => setTimerEnabled(e.target.checked)} className="h-5 w-5 rounded" />
              <span className="text-sm font-semibold text-slate-700">
                {isEn ? `⏱ Timer (${TIMER_SECONDS_PER_QUESTION}s per question)` : `⏱ टाइमर (${TIMER_SECONDS_PER_QUESTION} सेकंड प्रति प्रश्न)`}
              </span>
            </label>

            <button
              onClick={() => startQuiz()}
              className="mt-8 w-full rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow hover:bg-blue-700"
            >
              {isEn ? "🚀 Start Quiz" : "🚀 क्विज़ शुरू करें"}
            </button>
          </div>
        )}

        {/* ── TAKING ────────────────────────────────────────────────── */}
        {stage === "taking" && current && (
          <div>
            {usingDemo && (
              <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                {isEn ? "📌 Demo quiz — not enough study material for a full quiz from this source yet." : "📌 डेमो क्विज़ — इस स्रोत से पूर्ण क्विज़ हेतु अभी पर्याप्त सामग्री नहीं है।"}
              </div>
            )}
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{isEn ? "Question" : "प्रश्न"} {cursor + 1} {isEn ? "of" : "में से"} {questions.length}</span>
              {timerEnabled && (
                <span className={`rounded-full px-3 py-1 ${secondsLeft <= 10 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  ⏱ {secondsLeft}s
                </span>
              )}
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-black/5">
              <p className="text-xs font-semibold text-slate-400">📖 {current.item.bookTitle}{current.item.page ? ` · ${isEn ? "Page" : "पृष्ठ"} ${current.item.page}` : ""}</p>

              <QuestionBody
                question={current}
                answer={currentAnswer}
                onChange={(a) => updateAnswer(cursor, a)}
                isEn={isEn}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button onClick={goPrev} disabled={cursor === 0} className="rounded-full bg-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-30">
                ← {isEn ? "Previous" : "पिछला"}
              </button>
              {cursor < questions.length - 1 ? (
                <button onClick={goNext} className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white">
                  {isEn ? "Next" : "अगला"} →
                </button>
              ) : (
                <button onClick={submitQuiz} className="rounded-full bg-emerald-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                  ✅ {isEn ? "Submit" : "सबमिट करें"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────── */}
        {stage === "results" && (
          <div>
            <div className="rounded-3xl bg-gradient-to-r from-indigo-700 to-purple-700 p-8 text-center text-white shadow-xl">
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-200">{isEn ? "Your Score" : "आपका स्कोर"}</p>
              <h2 className="mt-2 text-5xl font-black">{score} / {questions.length}</h2>
              <p className="mt-2 text-lg font-bold text-indigo-100">{percentage}%</p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => startQuiz()} className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                🔄 {isEn ? "Generate New Quiz" : "नई क्विज़ बनाएं"}
              </button>
              {score < questions.length && (
                <button onClick={retryIncorrect} className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700">
                  🔁 {isEn ? "Retry Incorrect" : "गलत प्रश्न फिर से करें"}
                </button>
              )}
              <button onClick={() => setStage("setup")} className="rounded-full bg-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-300">
                ⚙️ {isEn ? "Change Settings" : "सेटिंग्स बदलें"}
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {questions.map((q, i) => {
                const correct = isCorrect(q, answers[i]);
                return (
                  <div key={q.id} className={`rounded-3xl bg-white p-6 shadow ring-1 ${correct ? "ring-emerald-200" : "ring-red-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-400">📖 {q.item.bookTitle}{q.item.page ? ` · ${isEn ? "Page" : "पृष्ठ"} ${q.item.page}` : ""}</p>
                      <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold ${correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {correct ? `✓ ${isEn ? "Correct" : "सही"}` : `✗ ${isEn ? "Wrong" : "गलत"}`}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-line font-semibold text-slate-900">{questionSummary(q)}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {isEn ? "Correct answer:" : "सही उत्तर:"} <span className="font-bold">{correctAnswerLabel(q)}</span>
                    </p>

                    {!correct && (
                      <div className="mt-3">
                        {!explanations[q.id] ? (
                          <button
                            onClick={() => explainAnswer(q)}
                            disabled={explaining === q.id}
                            className="rounded-full bg-purple-100 px-4 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                          >
                            {explaining === q.id ? (isEn ? "Thinking…" : "सोच रहा है…") : `✨ ${isEn ? "AI Explanation" : "एआई स्पष्टीकरण"}`}
                          </button>
                        ) : (
                          <p className="rounded-2xl bg-purple-50 p-3 text-sm text-purple-900">{explanations[q.id]}</p>
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
function correctAnswerLabel(q: Question): string {
  if (q.type === "mcq") return q.options[q.correctIndex];
  if (q.type === "truefalse") return q.correctAnswer ? "True" : "False";
  if (q.type === "fillblank") return q.correctAnswer;
  return q.pairs.map(p => `${p.left} → ${p.right}`).join("; ");
}

// ── Per-type question renderer (taking screen) ─────────────────────────
function QuestionBody({ question, answer, onChange, isEn }: { question: Question; answer: Answer; onChange: (a: Answer) => void; isEn: boolean }) {
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
              {v ? (isEn ? "True" : "सत्य") : (isEn ? "False" : "असत्य")}
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
        <h2 className="mt-3 text-xl font-bold text-slate-900">{isEn ? "Match the Following" : "निम्नलिखित का मिलान करें"}</h2>
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
                <option value="">{isEn ? "Choose a match…" : "एक मिलान चुनें…"}</option>
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
