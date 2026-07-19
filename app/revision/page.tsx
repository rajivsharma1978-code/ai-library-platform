"use client";

import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import { trackAIUsage, logActivity, type AIFeature } from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import LearningNav from "@/components/learning/LearningNav";
import ReturnToBook from "@/components/learning/ReturnToBook";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

const ACTION_TO_AI_FEATURE: Record<RevisionAction, AIFeature> = {
  notes: "revision", quiz: "quiz", flashcards: "flashcards", mcqs: "quiz",
};

// ── Local, read-only types mirroring the Reader's Study Workspace data
// shapes. Not imported from the Reader/Study Workspace modules — this
// page only reads the same localStorage keys; it never writes to
// ndl_highlights, ndl_notes, or ndl_bookmarks. ──────────────────────────
interface StoredHighlightLite {
  id: string; bookId: string; page: number; selectedText: string;
  color: string; createdAt: number; [key: string]: any;
}
interface StoredNoteLite {
  id: string; bookId: string; page: number; selectedText: string;
  note: string; createdAt: number; aiImproved?: boolean; [key: string]: any;
}
interface StoredBookmarkLite {
  id: string; bookId: string; page: number; title?: string; createdAt: number; [key: string]: any;
}
type DirectorBook = { id: string; title: string; [key: string]: any };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function findBook(bookId: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === bookId);
}
function isToday(ts: number) {
  return new Date(ts).toDateString() === new Date().toDateString();
}

const DEMO_TOPICS = ["Quantum Superposition", "Ancient Indian Universities", "Chandrayaan Descent Sequence", "Classical Algorithms"];

type RevisionItem =
  | { kind: "highlight"; id: string; bookId: string; page: number; preview: string; createdAt: number }
  | { kind: "note"; id: string; bookId: string; page: number; preview: string; createdAt: number };

const DEMO_TODAY: RevisionItem[] = [
  { kind: "highlight", id: "d1", bookId: "quantum", page: 42, preview: "A qubit can exist in a superposition of the |0⟩ and |1⟩ states simultaneously.", createdAt: Date.now() - 1000 * 60 * 40 },
  { kind: "note",      id: "d2", bookId: "nalanda", page: 12, preview: "Good exam point — compare with Takshashila as ancient Indian higher education.", createdAt: Date.now() - 1000 * 60 * 60 * 4 },
  { kind: "highlight", id: "d3", bookId: "chandrayaan-3", page: 8, preview: "The lander used laser and camera-based hazard detection during descent.", createdAt: Date.now() - 1000 * 60 * 60 * 20 },
];

type RevisionAction = "notes" | "quiz" | "flashcards" | "mcqs";
// `label` is intentionally omitted here — it's language-dependent and
// resolved from UI_TEXT inside the component (see `actionLabels` below).
// `icon`/`instruction` are not language-dependent: `instruction` is the
// literal text sent to the AI as part of the prompt, which must stay
// exactly as-is regardless of UI language (this batch is localization of
// visible UI text only, not of AI prompts).
const ACTION_META: Record<RevisionAction, { icon: string; instruction: string }> = {
  notes:      { icon: "📚", instruction: "Create concise revision notes (headings + short bullet points) suitable for quick exam revision." },
  quiz:       { icon: "❓", instruction: "Create 5 quiz questions with answers to test understanding." },
  flashcards: { icon: "🎴", instruction: "Create 8 flashcards (FRONT: / BACK: format)." },
  mcqs:       { icon: "☑️", instruction: "Create 5 multiple-choice questions, 4 options each, with the correct answer clearly marked." },
};
// English-only, used solely for the internal (non-UI) admin activity log
// string passed to logActivity() below — kept exactly as before so that
// log's format/language doesn't change, matching every other logActivity
// call in this app (all English regardless of UI language).
const ACTION_LABEL_EN: Record<RevisionAction, string> = {
  notes: "Generate Revision Notes", quiz: "Practice Quiz", flashcards: "Flashcards", mcqs: "MCQs",
};

export default function RevisionPage() {
  const { language } = useLanguage();

  const [mounted, setMounted] = useState(false);
  // isHydrated is false during SSR and the client's first (hydration) render,
  // so t always resolves to English then — matching the server markup exactly.
  // It only flips true in a useEffect, strictly after hydration completes.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const t = UI_TEXT[hydrated ? language : "en"];
  const actionLabels: Record<RevisionAction, string> = {
    notes: t.revisionActionNotes, quiz: t.revisionActionQuiz,
    flashcards: t.commonFlashcards, mcqs: t.revisionActionMcqs,
  };
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState("0");
  const [completedQuizzes, setCompletedQuizzes] = useState("0");

  const [activeAction, setActiveAction] = useState<RevisionAction | null>(null);
  const [aiOutput, setAiOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));

    const storedWeak = localStorage.getItem("aiWeakTopics");
    if (storedWeak) {
      try { setWeakTopics(JSON.parse(storedWeak)); } catch {}
    }
    // Two quiz-score keys were listed — prefer the newer ndl_-prefixed one,
    // fall back to the legacy one used by the existing Analytics page.
    setQuizScore(localStorage.getItem("ndl_aiQuizScore") ?? localStorage.getItem("aiQuizScore") ?? "0");
    setCompletedQuizzes(localStorage.getItem("aiCompletedQuizzes") ?? "0");

    setMounted(true);
  }, []);

  const hasRealData = highlights.length > 0 || notes.length > 0;
  const usingDemoTopics = weakTopics.length === 0;
  const topics = usingDemoTopics ? DEMO_TOPICS : weakTopics;

  // ── Overview stats ───────────────────────────────────────────────────
  const stats = {
    highlightsToRevise: highlights.length,
    notesToReview: notes.length,
    bookmarkedPages: bookmarks.length,
    weakTopics: topics.length,
  };

  // ── Today's Revision — recent highlights + notes, most recent first ───
  const todaysItems: RevisionItem[] = useMemo(() => {
    const real: RevisionItem[] = [
      ...highlights.map((h): RevisionItem => ({
        kind: "highlight", id: h.id, bookId: h.bookId, page: h.page,
        preview: h.selectedText, createdAt: h.createdAt,
      })),
      ...notes.map((n): RevisionItem => ({
        kind: "note", id: n.id, bookId: n.bookId, page: n.page,
        preview: n.note, createdAt: n.createdAt,
      })),
    ].sort((a, b) => b.createdAt - a.createdAt);
    return real.length > 0 ? real.slice(0, 8) : DEMO_TODAY;
  }, [highlights, notes]);
  const usingDemoToday = todaysItems === DEMO_TODAY;

  // ── Study Plan counts ─────────────────────────────────────────────────
  const todayCount = [...highlights, ...notes].filter(i => isToday(i.createdAt)).length;
  const weekCount = [...highlights, ...notes].filter(i => Date.now() - i.createdAt <= WEEK_MS).length;

  // ── Combined revision source text for AI actions ─────────────────────
  const revisionSourceText = useMemo(() => {
    const parts: string[] = [];
    highlights.forEach(h => {
      const book = findBook(h.bookId)?.title ?? h.bookId;
      parts.push(`[Highlight — ${book}, page ${h.page}]\n${h.selectedText}`);
    });
    notes.forEach(n => {
      const book = findBook(n.bookId)?.title ?? n.bookId;
      parts.push(`[Note — ${book}, page ${n.page}]\nPassage: ${n.selectedText}\nNote: ${n.note}`);
    });
    return parts.join("\n\n");
  }, [highlights, notes]);

  async function runAction(action: RevisionAction) {
    const content = revisionSourceText.trim() || DEMO_TODAY.map(d => d.preview).join("\n\n");
    setActiveAction(action);
    setLoading(true);
    setAiOutput("");
    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: ACTION_META[action].instruction,
          book: "My Revision",
          chapter: "AI Revision Center",
          content,
        }),
      });
      const data = await res.json();
      setAiOutput(data.answer || data.error || "No output generated.");
      trackAIUsage(ACTION_TO_AI_FEATURE[action]);
      logActivity("ai", `AI generated ${ACTION_LABEL_EN[action].toLowerCase()} in the Revision Center`);

      const oldAnalytics = JSON.parse(localStorage.getItem("ndl_ai_analytics") || "{}");
      const bump: Record<string, any> = { ...oldAnalytics };
      if (action === "notes") {
        bump.revisionSummariesGenerated = (oldAnalytics.revisionSummariesGenerated || 0) + 1;
        bump.lastRevisionGeneratedAt = new Date().toISOString();
      } else {
        bump.quizzesGenerated = (oldAnalytics.quizzesGenerated || 0) + 1;
        bump.lastQuizGeneratedAt = new Date().toISOString();
      }
      localStorage.setItem("ndl_ai_analytics", JSON.stringify(bump));
    } catch {
      setAiOutput(t.revisionGenerationError);
    } finally {
      setLoading(false);
    }
  }

  function speak() {
    if (!aiOutput.trim()) return;
    const utt = new SpeechSynthesisUtterance(aiOutput);
    utt.lang = "en-IN"; utt.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }
  function stopSpeaking() { window.speechSynthesis.cancel(); }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {t.commonLoading}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-6xl">

        <PageHeader
          title={t.revisionPageTitle}
          subtitle={t.revisionPageSubtitle}
          homeLabel={t.commonHome}
        />

        <LearningNav />
        <ReturnToBook />

        {!hasRealData && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            {t.revisionDemoBanner}
          </InfoCard>
        )}

        {/* 1. Revision overview cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={`⭐ ${t.revisionStatHighlights}`} value={stats.highlightsToRevise} />
          <StatCard label={`📝 ${t.revisionStatNotes}`} value={stats.notesToReview} />
          <StatCard label={`🔖 ${t.revisionStatBookmarks}`} value={stats.bookmarkedPages} />
          <StatCard label={`🧩 ${t.commonWeakTopics}`} value={stats.weakTopics} />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-8">

            {/* 2. Today's Revision */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">
                  {t.revisionTodaySectionTitle}
                </h2>
                {usingDemoToday && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">{t.commonDemo}</span>
                )}
              </div>
              <InfoCard className="p-3">
                {todaysItems.map((item, i) => {
                  const book = findBook(item.bookId);
                  return (
                    <div key={item.id} className={`flex items-start gap-3 px-4 py-4 ${i !== todaysItems.length - 1 ? "border-b border-slate-100" : ""}`}>
                      <span className="text-lg">{item.kind === "highlight" ? "⭐" : "📝"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{book?.title ?? item.bookId} <span className="font-normal text-slate-400">· {t.commonPage} {item.page}</span></p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">“{item.preview.length > 100 ? item.preview.slice(0, 100) + "…" : item.preview}”</p>
                      </div>
                    </div>
                  );
                })}
              </InfoCard>
            </section>

            {/* 3. Weak Concepts */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">
                  {t.revisionWeakConceptsTitle}
                </h2>
                {usingDemoTopics && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">{t.commonDemo}</span>
                )}
              </div>
              <InfoCard className="flex flex-wrap gap-2 p-5">
                {topics.map(topic => (
                  <span key={topic} className="rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
                    🧩 {topic}
                  </span>
                ))}
              </InfoCard>
            </section>

            {/* 4. Revision Actions */}
            <section>
              <h2 className="mb-4 text-lg font-black text-slate-900">
                {t.revisionActionsTitle}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(ACTION_META) as RevisionAction[]).map(action => (
                  <button
                    key={action}
                    onClick={() => runAction(action)}
                    disabled={loading}
                    className={`rounded-2xl px-4 py-4 text-center shadow-[0_10px_30px_rgba(75,45,12,0.08)] transition-colors disabled:opacity-50 ${
                      activeAction === action ? "bg-slate-950 text-white" : "bg-white text-slate-800 ring-1 ring-black/5 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-xl">{ACTION_META[action].icon}</div>
                    <div className="mt-1 text-xs font-bold">{actionLabels[action]}</div>
                  </button>
                ))}
              </div>

              {(loading || aiOutput) && (
                <InfoCard className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                      {activeAction ? `${ACTION_META[activeAction].icon} ${actionLabels[activeAction]}` : ""}
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={speak} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">🔊 {t.revisionReadAloud}</button>
                      <button onClick={stopSpeaking} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">{t.premiumReaderStop}</button>
                    </div>
                  </div>
                  {loading ? (
                    <p className="animate-pulse text-sm text-slate-400">{t.revisionGenerating}</p>
                  ) : (
                    <div className="whitespace-pre-line text-slate-700">{aiOutput}</div>
                  )}
                </InfoCard>
              )}
            </section>
          </div>

          {/* 5. Study Plan */}
          <div>
            <h2 className="mb-4 text-lg font-black text-slate-900">
              {t.revisionStudyPlanTitle}
            </h2>
            <div className="flex flex-col gap-4">
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.revisionToday}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {t.revisionPlanTodaySentence.replace("{count}", String(todayCount))}
                </p>
              </InfoCard>
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.revisionThisWeek}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {t.revisionPlanWeekSentence.replace("{count}", String(weekCount))}
                </p>
              </InfoCard>
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.revisionBeforeExam}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {t.revisionPlanExamSentence
                    .replace("{count}", String(stats.highlightsToRevise + stats.notesToReview))
                    .replace("{weak}", String(stats.weakTopics))}
                </p>
              </InfoCard>
              <InfoCard tone="amber" className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{t.quizTrackRecordTitle}</p>
                <p className="mt-2 text-sm text-amber-900">
                  {t.commonScore}: <span className="font-bold">{quizScore}</span> · {t.myBooksCompleted}: <span className="font-bold">{completedQuizzes}</span>
                </p>
              </InfoCard>
            </div>
          </div>
        </div>
      </div>
      <AccessibilityToolbar />
    </main>
  );
}
