"use client";

import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import { trackAIUsage, logActivity, type AIFeature } from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
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
const ACTION_META: Record<RevisionAction, { label: string; icon: string; instruction: string }> = {
  notes:      { label: "Generate Revision Notes", icon: "📚", instruction: "Create concise revision notes (headings + short bullet points) suitable for quick exam revision." },
  quiz:       { label: "Practice Quiz",            icon: "❓", instruction: "Create 5 quiz questions with answers to test understanding." },
  flashcards: { label: "Flashcards",                icon: "🎴", instruction: "Create 8 flashcards (FRONT: / BACK: format)." },
  mcqs:       { label: "MCQs",                       icon: "☑️", instruction: "Create 5 multiple-choice questions, 4 options each, with the correct answer clearly marked." },
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
  const isEn = t.navLibrary === "Library";
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
      logActivity("ai", `AI generated ${ACTION_META[action].label.toLowerCase()} in the Revision Center`);

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
      setAiOutput(isEn ? "Something went wrong while generating this." : "इसे बनाते समय कुछ गड़बड़ हो गई।");
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
          title={isEn ? "AI Revision Center" : "एआई पुनरीक्षण केंद्र"}
          subtitle={isEn
            ? "Everything you've highlighted and noted, turned into a focused revision plan."
            : "आपके सभी हाइलाइट्स और नोट्स से बना एक केंद्रित पुनरीक्षण योजना।"}
          homeLabel={isEn ? "Home" : "होम"}
        />

        {!hasRealData && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            {isEn
              ? "📌 Showing a polished demo revision plan — highlight text or add notes in the Reader to build your real one."
              : "📌 डेमो पुनरीक्षण योजना दिखाई जा रही है — अपनी असली योजना बनाने के लिए रीडर में टेक्स्ट हाइलाइट करें या नोट्स जोड़ें।"}
          </InfoCard>
        )}

        {/* 1. Revision overview cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={`⭐ ${isEn ? "Highlights to Revise" : "पुनरीक्षण हेतु हाइलाइट्स"}`} value={stats.highlightsToRevise} />
          <StatCard label={`📝 ${isEn ? "Notes to Review" : "समीक्षा हेतु नोट्स"}`} value={stats.notesToReview} />
          <StatCard label={`🔖 ${isEn ? "Bookmarked Pages" : "बुकमार्क किए पृष्ठ"}`} value={stats.bookmarkedPages} />
          <StatCard label={`🧩 ${isEn ? "Weak Topics" : "कमजोर विषय"}`} value={stats.weakTopics} />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-8">

            {/* 2. Today's Revision */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">
                  {isEn ? "Today's Revision" : "आज का पुनरीक्षण"}
                </h2>
                {usingDemoToday && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">demo</span>
                )}
              </div>
              <InfoCard className="p-3">
                {todaysItems.map((item, i) => {
                  const book = findBook(item.bookId);
                  return (
                    <div key={item.id} className={`flex items-start gap-3 px-4 py-4 ${i !== todaysItems.length - 1 ? "border-b border-slate-100" : ""}`}>
                      <span className="text-lg">{item.kind === "highlight" ? "⭐" : "📝"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{book?.title ?? item.bookId} <span className="font-normal text-slate-400">· {isEn ? "page" : "पृष्ठ"} {item.page}</span></p>
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
                  {isEn ? "Weak Concepts" : "कमजोर अवधारणाएं"}
                </h2>
                {usingDemoTopics && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">demo</span>
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
                {isEn ? "Revision Actions" : "पुनरीक्षण क्रियाएं"}
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
                    <div className="mt-1 text-xs font-bold">{ACTION_META[action].label}</div>
                  </button>
                ))}
              </div>

              {(loading || aiOutput) && (
                <InfoCard className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                      {activeAction ? `${ACTION_META[activeAction].icon} ${ACTION_META[activeAction].label}` : ""}
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={speak} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">🔊 {isEn ? "Read Aloud" : "पढ़ें"}</button>
                      <button onClick={stopSpeaking} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">{isEn ? "Stop" : "रोकें"}</button>
                    </div>
                  </div>
                  {loading ? (
                    <p className="animate-pulse text-sm text-slate-400">{isEn ? "Generating…" : "बनाया जा रहा है…"}</p>
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
              {isEn ? "Study Plan" : "अध्ययन योजना"}
            </h2>
            <div className="flex flex-col gap-4">
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{isEn ? "Today" : "आज"}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {isEn
                    ? `${todayCount} item${todayCount === 1 ? "" : "s"} added today. Review them with a quick Practice Quiz.`
                    : `आज ${todayCount} आइटम जोड़े गए। एक त्वरित क्विज़ के साथ उनकी समीक्षा करें।`}
                </p>
              </InfoCard>
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{isEn ? "This Week" : "इस सप्ताह"}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {isEn
                    ? `${weekCount} item${weekCount === 1 ? "" : "s"} from the last 7 days. Generate Flashcards to lock them in.`
                    : `पिछले 7 दिनों से ${weekCount} आइटम। उन्हें याद रखने के लिए फ्लैशकार्ड बनाएं।`}
                </p>
              </InfoCard>
              <InfoCard className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{isEn ? "Before Exam" : "परीक्षा से पहले"}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {isEn
                    ? `Run a full Generate Revision Notes pass across all ${stats.highlightsToRevise + stats.notesToReview} saved items, then clear your ${stats.weakTopics} weak topic(s) with MCQs.`
                    : `सभी ${stats.highlightsToRevise + stats.notesToReview} सहेजे गए आइटम पर पुनरीक्षण नोट्स बनाएं, फिर MCQ से अपने ${stats.weakTopics} कमजोर विषय दूर करें।`}
                </p>
              </InfoCard>
              <InfoCard tone="amber" className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{isEn ? "Quiz Track Record" : "क्विज़ रिकॉर्ड"}</p>
                <p className="mt-2 text-sm text-amber-900">
                  {isEn ? "Score" : "स्कोर"}: <span className="font-bold">{quizScore}</span> · {isEn ? "Completed" : "पूर्ण"}: <span className="font-bold">{completedQuizzes}</span>
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
