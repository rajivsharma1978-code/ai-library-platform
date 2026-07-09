"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import AppButton from "@/components/ui/AppButton";

// ── Local, read-only types mirroring Reader/Study Workspace/My Space data
// shapes. Not imported from those modules — this page only reads the same
// localStorage keys and never writes to any of them except ndl_ai_analytics
// bookkeeping fields it already owned before this refinement. ──────────
interface StoredHighlightLite { id: string; bookId: string; page: number; selectedText: string; color: string; createdAt: number; [k: string]: any; }
interface StoredNoteLite { id: string; bookId: string; page: number; selectedText: string; note: string; createdAt: number; aiImproved?: boolean; [k: string]: any; }
interface StoredBookmarkLite { id: string; bookId: string; page: number; title?: string; createdAt: number; [k: string]: any; }
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; chapter?: string; lastReadAt: number; [k: string]: any; }
interface LearningActivityEntry { id: string; type: string; bookId: string; bookTitle?: string; detail?: string; page?: number; timestamp: number; [k: string]: any; }
interface AIUsageStats { questionsAsked: number; lastUsedAt?: number; }
type DirectorBook = { id: string; title: string; [k: string]: any };

const DAY_MS = 24 * 60 * 60 * 1000;

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function readObject<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function findBook(bookId: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === bookId);
}

const DEMO_WEAK_TOPICS = ["Quantum Superposition", "Ancient Indian Universities", "Chandrayaan Descent Sequence"];
const DEMO_LANGUAGE_USAGE = [
  { lang: "English", pct: 68 },
  { lang: "Hindi", pct: 22 },
  { lang: "Other", pct: 10 },
];
// A plausible-looking week shape, used only when there's truly no real
// activity yet — so the chart never renders as a flat, empty-looking line.
const DEMO_WEEK_COUNTS = [2, 4, 1, 5, 3, 6, 4];

export default function AnalyticsPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [mounted, setMounted] = useState(false);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [activity, setActivity] = useState<LearningActivityEntry[]>([]);
  const [aiStats, setAiStats] = useState<AIUsageStats>({ questionsAsked: 0 });
  const [quizScore, setQuizScore] = useState("0");
  const [completedQuizzes, setCompletedQuizzes] = useState("0");
  const [weakTopics, setWeakTopics] = useState<string[]>([]);

  useEffect(() => {
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setActivity(readArray<LearningActivityEntry>("ndl_learning_activity"));
    setAiStats(readObject<AIUsageStats>("ndl_ai_usage_stats") ?? { questionsAsked: 0 });
    setQuizScore(localStorage.getItem("ndl_aiQuizScore") ?? localStorage.getItem("aiQuizScore") ?? "0");
    setCompletedQuizzes(localStorage.getItem("aiCompletedQuizzes") ?? "0");
    const storedWeak = localStorage.getItem("aiWeakTopics");
    if (storedWeak) { try { setWeakTopics(JSON.parse(storedWeak)); } catch {} }
    setMounted(true);
  }, []);

  const hasRealData = highlights.length > 0 || notes.length > 0 || bookmarks.length > 0 || progress.length > 0;

  // ── 1. Overview cards ─────────────────────────────────────────────────
  const booksOpenedCount = useMemo(() => {
    const fromProgress = new Set(progress.map(p => p.bookId));
    const fromActivity = new Set(activity.filter(a => a.type === "open_book").map(a => a.bookId));
    const combined = new Set([...fromProgress, ...fromActivity]);
    return combined.size > 0 ? combined.size : 3; // polished fallback
  }, [progress, activity]);

  const usingDemoBooksOpened = progress.length === 0 && activity.filter(a => a.type === "open_book").length === 0;

  const overview = {
    booksOpened: booksOpenedCount,
    highlights: highlights.length,
    notes: notes.length,
    bookmarks: bookmarks.length,
    aiQuestions: aiStats.questionsAsked,
    quizScore,
  };

  // ── 2. Reading progress ───────────────────────────────────────────────
  const readingProgressList = useMemo(() => {
    if (progress.length > 0) {
      return [...progress].sort((a, b) => b.lastReadAt - a.lastReadAt).slice(0, 4).map(p => ({
        book: findBook(p.bookId),
        bookId: p.bookId,
        pagesRead: p.currentPage,
        totalPages: p.totalPages,
        pct: Math.min(100, Math.round((p.currentPage / Math.max(1, p.totalPages)) * 100)),
      }));
    }
    // Demo fallback across the first few catalog books.
    return (directorBooks as DirectorBook[]).slice(0, 3).map((b, i) => {
      const total = Number(b.pages) || 220;
      const pct = [82, 55, 34][i] ?? 40;
      return { book: b, bookId: b.id, pagesRead: Math.round((pct / 100) * total), totalPages: total, pct };
    });
  }, [progress]);
  const usingDemoProgress = progress.length === 0;

  // ── 3. Study activity — merged, most-recent-first ─────────────────────
  const studyActivity = useMemo(() => {
    const merged: LearningActivityEntry[] = [
      ...highlights.map((h): LearningActivityEntry => ({
        id: `h-${h.id}`, type: "highlight", bookId: h.bookId, bookTitle: findBook(h.bookId)?.title,
        detail: `“${h.selectedText.slice(0, 50)}${h.selectedText.length > 50 ? "…" : ""}”`, timestamp: h.createdAt,
      })),
      ...notes.map((n): LearningActivityEntry => ({
        id: `n-${n.id}`, type: "note", bookId: n.bookId, bookTitle: findBook(n.bookId)?.title,
        detail: n.note.slice(0, 50) + (n.note.length > 50 ? "…" : ""), timestamp: n.createdAt,
      })),
      ...bookmarks.map((b): LearningActivityEntry => ({
        id: `b-${b.id}`, type: "bookmark", bookId: b.bookId, bookTitle: findBook(b.bookId)?.title,
        detail: b.title?.trim() || `Page ${b.page}`, timestamp: b.createdAt,
      })),
      ...activity,
    ].sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, 8);
  }, [highlights, notes, bookmarks, activity]);
  const usingDemoActivity = studyActivity.length === 0;
  const ACTIVITY_ICON: Record<string, string> = { highlight: "⭐", note: "📝", bookmark: "🔖", quiz: "❓", open_book: "📖", ai_question: "🤖" };

  // ── 4. Weak topics ─────────────────────────────────────────────────────
  const usingDemoWeakTopics = weakTopics.length === 0;
  const topics = usingDemoWeakTopics ? DEMO_WEAK_TOPICS : weakTopics;

  // ── 6. Weekly learning chart — last 7 days, simple bars ────────────────
  const weekCounts = useMemo(() => {
    const all = [...highlights, ...notes, ...bookmarks].map(x => x.createdAt);
    if (all.length === 0) return DEMO_WEEK_COUNTS;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = today.getTime() - i * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      counts.push(all.filter(ts => ts >= dayStart && ts < dayEnd).length);
    }
    return counts;
  }, [highlights, notes, bookmarks]);
  const usingDemoWeek = weekCounts === DEMO_WEEK_COUNTS;
  const weekLabels = useMemo(() => {
    const labels: string[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    return labels;
  }, []);
  const maxWeekCount = Math.max(1, ...weekCounts);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-10">
        <div className="mx-auto max-w-7xl animate-pulse text-sm font-semibold text-slate-400">
          {isEn ? "Loading your analytics…" : "आपका विश्लेषण लोड हो रहा है…"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title={isEn ? "Learning Analytics" : "शिक्षण विश्लेषण"}
          subtitle={isEn
            ? "Track reading progress, AI interactions, learning patterns, revision performance, and knowledge growth."
            : "पठन प्रगति, एआई इंटरैक्शन, सीखने के पैटर्न, पुनरीक्षण प्रदर्शन और ज्ञान वृद्धि को ट्रैक करें।"}
          homeLabel={t.navLibrary}
        />

        {!hasRealData && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            {isEn
              ? "📌 Showing polished demo analytics — read, highlight, and note in the Reader to see your real stats here."
              : "📌 डेमो विश्लेषण दिखाया जा रहा है — अपने असली आंकड़े देखने के लिए रीडर में पढ़ें, हाइलाइट करें और नोट्स लें।"}
          </InfoCard>
        )}

        {/* 1. Overview cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard icon="📖" label={isEn ? "Books Opened" : "खोली गई किताबें"} value={overview.booksOpened} badge={usingDemoBooksOpened ? "demo" : undefined} />
          <StatCard icon="⭐" label={isEn ? "Highlights" : "हाइलाइट्स"} value={overview.highlights} />
          <StatCard icon="📝" label={isEn ? "Notes" : "नोट्स"} value={overview.notes} />
          <StatCard icon="🔖" label={isEn ? "Bookmarks" : "बुकमार्क"} value={overview.bookmarks} />
          <StatCard icon="🤖" label={isEn ? "AI Questions" : "एआई प्रश्न"} value={overview.aiQuestions} />
          <StatCard icon="🏆" label={isEn ? "Quiz Score" : "क्विज़ स्कोर"} value={overview.quizScore} />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-8">

            {/* 2. Reading progress */}
            <InfoCard>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-950">{isEn ? "Reading Progress" : "पठन प्रगति"}</h2>
                {usingDemoProgress && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>}
              </div>
              <div className="space-y-5">
                {readingProgressList.map(item => (
                  <div key={item.bookId}>
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{item.book?.title ?? item.bookId}</p>
                        <p className="text-xs text-slate-400">{item.pagesRead} / {item.totalPages} {isEn ? "pages" : "पृष्ठ"} · {item.pct}%</p>
                      </div>
                      <AppButton href={`/reader-premium?book=${item.bookId}`} size="sm">
                        {isEn ? "Continue Reading" : "पढ़ना जारी रखें"}
                      </AppButton>
                    </div>
                    <div className="bg-slate-200 rounded-full h-4">
                      <div className="bg-amber-500 h-4 rounded-full transition-all" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </InfoCard>

            {/* 3. Study activity */}
            <InfoCard>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-950">{isEn ? "Study Activity" : "अध्ययन गतिविधि"}</h2>
                {usingDemoActivity && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>}
              </div>
              {usingDemoActivity ? (
                <p className="text-slate-500">{isEn ? "No activity yet — start reading to build your timeline." : "अभी तक कोई गतिविधि नहीं — अपनी समयरेखा बनाने के लिए पढ़ना शुरू करें।"}</p>
              ) : (
                <div className="space-y-1">
                  {studyActivity.map((a, i) => (
                    <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== studyActivity.length - 1 ? "border-b border-slate-100" : ""}`}>
                      <span className="text-lg">{ACTIVITY_ICON[a.type] ?? "•"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{a.bookTitle ?? a.bookId}</p>
                        {a.detail && <p className="truncate text-xs text-slate-500">{a.detail}</p>}
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400">{new Date(a.timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>

            {/* 6. Weekly learning chart */}
            <InfoCard>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-950">{isEn ? "Weekly Learning" : "साप्ताहिक शिक्षण"}</h2>
                {usingDemoWeek && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>}
              </div>
              <div className="flex items-end justify-between gap-3" style={{ height: 160 }}>
                {weekCounts.map((c, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className="w-full max-w-[36px] rounded-t-lg bg-amber-500 transition-all"
                        style={{ height: `${Math.max(6, Math.round((c / maxWeekCount) * 100))}%` }}
                        title={`${c}`}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">{weekLabels[i]}</span>
                  </div>
                ))}
              </div>
            </InfoCard>
          </div>

          <div className="flex flex-col gap-8">
            {/* 4. Weak topics */}
            <InfoCard className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-950">{isEn ? "Weak Topics" : "कमजोर विषय"}</h2>
                {usingDemoWeakTopics && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {topics.map(topic => (
                  <span key={topic} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">🧩 {topic}</span>
                ))}
              </div>
              <Link href="/revision" className="mt-4 inline-block text-xs font-bold text-blue-600 hover:underline">
                {isEn ? "Practice these in Revision →" : "पुनरीक्षण में अभ्यास करें →"}
              </Link>
            </InfoCard>

            {/* 5. Language usage (demo data acceptable) */}
            <InfoCard className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-950">{isEn ? "Language Usage" : "भाषा उपयोग"}</h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>
              </div>
              <div className="space-y-3">
                {DEMO_LANGUAGE_USAGE.map(l => (
                  <div key={l.lang}>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>{l.lang}</span><span>{l.pct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-amber-500" style={{ width: `${l.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </InfoCard>

            {/* Quiz track record */}
            <InfoCard tone="dark" className="p-6">
              <h2 className="text-lg font-black">{isEn ? "Quiz Track Record" : "क्विज़ रिकॉर्ड"}</h2>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xl font-bold">{quizScore}</p>
                  <p className="text-xs text-slate-400">{isEn ? "Score" : "स्कोर"}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">{completedQuizzes}</p>
                  <p className="text-xs text-slate-400">{isEn ? "Completed" : "पूर्ण"}</p>
                </div>
              </div>
            </InfoCard>
          </div>
        </div>
      </div>
    </main>
  );
}
