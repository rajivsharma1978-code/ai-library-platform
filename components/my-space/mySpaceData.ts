// ── My Space (Phase 3) — data layer ─────────────────────────────────────
// Read-only with respect to every OTHER feature's storage: this file reads
// the same localStorage keys the Reader/Study Workspace already write
// (ndl_highlights, ndl_notes, ndl_bookmarks) but never imports their
// modules and never writes to those keys — My Space cannot break or
// depend on Study Workspace's internals changing.
//
// It also introduces three NEW keys, owned entirely by My Space:
//   ndl_my_library        — books the user has added to their library
//   ndl_reading_progress  — per-book current page / last-read timestamp
//   ndl_learning_activity — a general activity feed (optional; if absent,
//                           this file derives a reasonable feed from the
//                           highlight/note/bookmark timestamps instead)
//   ndl_ai_usage_stats    — a simple counter of AI questions asked

import { UI_TEXT } from "@/lib/i18n";

// Widened to `string` values (rather than `typeof UI_TEXT["en"]` directly)
// so this accepts `t` for ANY of the 6 language variants, not just the
// literal-typed English one.
export type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

export type DirectorBook = {
    id: string;
    title: string;
    author?: string;
    description?: string;
    pages?: number | string;
    language?: string;
    pdf?: string;
    layout?: string;
    cover?: string;
    coverImage?: string;
    image?: string;
    [key: string]: any;
  };
  
  // ── Existing Phase 2 shapes, referenced by TYPE ONLY (no runtime import
  // of study/storage.ts or study/studyData.ts) so My Space has zero coupling
  // to how Study Workspace persists or renders its own data. ────────────────
  export type HighlightColor = "yellow" | "green" | "blue" | "pink";
  export interface StoredHighlightLite {
    id: string;
    bookId: string;
    page: number;
    selectedText: string;
    color: HighlightColor;
    createdAt: number;
  }
  export interface StoredNoteLite {
    id: string;
    bookId: string;
    page: number;
    selectedText: string;
    note: string;
    createdAt: number;
  }
  export interface StoredBookmarkLite {
    id: string;
    bookId: string;
    page: number;
    title?: string;
    createdAt: number;
  }
  
  // ── New Phase 3 shapes ───────────────────────────────────────────────────
  export interface LibraryEntry {
    bookId: string;
    addedAt: number;
  }
  export interface ReadingProgressEntry {
    bookId: string;
    currentPage: number;
    totalPages: number;
    chapter?: string;
    lastReadAt: number;
  }
  export type ActivityType =
    | "highlight" | "note" | "bookmark" | "quiz" | "open_book" | "ai_question";
  export interface LearningActivityEntry {
    id: string;
    type: ActivityType;
    bookId: string;
    bookTitle?: string;
    detail?: string;
    page?: number;
    timestamp: number;
  }
  export interface AIUsageStats {
    questionsAsked: number;
    lastUsedAt?: number;
  }
  
  const KEYS = {
    highlights: "ndl_highlights",
    notes: "ndl_notes",
    bookmarks: "ndl_bookmarks",
    myLibrary: "ndl_my_library",
    readingProgress: "ndl_reading_progress",
    learningActivity: "ndl_learning_activity",
    aiUsageStats: "ndl_ai_usage_stats",
  } as const;
  
  // ── Safe, local-only localStorage helpers (deliberately NOT shared with
  // study/storage.ts — no cross-feature dependency). ──────────────────────
  function readArray<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function readObject<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  
  export function loadHighlights(): StoredHighlightLite[] { return readArray(KEYS.highlights); }
  export function loadNotes(): StoredNoteLite[] { return readArray(KEYS.notes); }
  export function loadBookmarks(): StoredBookmarkLite[] { return readArray(KEYS.bookmarks); }
  export function loadMyLibrary(): LibraryEntry[] { return readArray(KEYS.myLibrary); }
  export function loadReadingProgress(): ReadingProgressEntry[] { return readArray(KEYS.readingProgress); }

  // ── Phase C1F: reading-progress writer ──────────────────────────────
  // ndl_reading_progress previously had readers everywhere (Continue
  // Reading, My Library, My Books, Analytics) but no writer anywhere in
  // the app — see the file header. This is that writer, upserting by
  // bookId so each book keeps its own independent position. Validates
  // before writing so a bad call can never store an invalid page or
  // corrupt another book's entry; silently no-ops on invalid input
  // rather than throwing, matching every other helper in this file.
  export function saveReadingProgress(bookId: string, currentPage: number, totalPages?: number, chapter?: string): void {
    if (typeof window === "undefined") return;
    if (!bookId) return;
    const page = Math.floor(currentPage);
    if (!Number.isFinite(page) || page < 1) return;
    const safeTotal = totalPages !== undefined && Number.isFinite(totalPages) && totalPages > 0
      ? Math.floor(totalPages)
      : undefined;
    const clampedPage = safeTotal ? Math.min(page, safeTotal) : page;
    try {
      const existing = loadReadingProgress().filter(
        (e): e is ReadingProgressEntry => !!e && typeof e.bookId === "string" && e.bookId.length > 0
      );
      const idx = existing.findIndex(e => e.bookId === bookId);
      const priorTotal = idx >= 0 && Number.isFinite(existing[idx].totalPages) ? existing[idx].totalPages : undefined;
      const priorChapter = idx >= 0 ? existing[idx].chapter : undefined;
      const entry: ReadingProgressEntry = {
        bookId,
        currentPage: clampedPage,
        totalPages: safeTotal ?? priorTotal ?? clampedPage,
        lastReadAt: Date.now(),
        ...((chapter ?? priorChapter) ? { chapter: chapter ?? priorChapter } : {}),
      };
      if (idx >= 0) existing[idx] = entry; else existing.push(entry);
      window.localStorage.setItem(KEYS.readingProgress, JSON.stringify(existing));
    } catch {
      // ignore quota/serialization errors — this is best-effort state only
    }
  }

  /** Validated resume page for `bookId`, or null if there's no entry, the
   *  entry is malformed (NaN/zero/negative/non-numeric), or it belongs to
   *  a different book — never applies one book's position to another.
   *  Clamps to `totalPages` when known so a stale entry can never resolve
   *  past the book's real last page. */
  export function getValidatedReadingProgress(bookId: string, totalPages?: number): number | null {
    if (!bookId) return null;
    const entry = loadReadingProgress().find(e => e && e.bookId === bookId);
    if (!entry) return null;
    const raw = Number(entry.currentPage);
    if (!Number.isFinite(raw) || raw < 1) return null;
    const page = Math.floor(raw);
    const safeTotal = Number.isFinite(totalPages) && (totalPages as number) > 0 ? Math.floor(totalPages as number) : undefined;
    return safeTotal ? Math.min(page, safeTotal) : page;
  }
  export function loadLearningActivity(): LearningActivityEntry[] { return readArray(KEYS.learningActivity); }
  export function loadAIUsageStats(): AIUsageStats {
    return readObject<AIUsageStats>(KEYS.aiUsageStats) ?? { questionsAsked: 0 };
  }
  
  // ── Greeting ─────────────────────────────────────────────────────────────
  export function getGreeting(t: UIText, now: Date = new Date()): string {
    const h = now.getHours();
    if (h < 12) return t.mySpaceGoodMorning;
    if (h < 17) return t.mySpaceGoodAfternoon;
    return t.mySpaceGoodEvening;
  }
  
  // ── Book lookup helper (tolerant of unknown directorBooks shape) ────────
  export function findBook(directorBooks: DirectorBook[], bookId: string): DirectorBook | undefined {
    return directorBooks.find(b => b.id === bookId);
  }
  export function bookCoverUrl(book: DirectorBook | undefined): string | undefined {
    return book?.cover ?? book?.coverImage ?? book?.image;
  }
  export function bookTotalPages(book: DirectorBook | undefined): number {
    const n = Number(book?.pages);
    return Number.isFinite(n) && n > 0 ? n : 220;
  }
  
  // ── Polished demo fallbacks (used ONLY when real data is genuinely
  // absent, per "if some keys are empty, show polished demo fallback
  // data") ──────────────────────────────────────────────────────────────
  export const DEMO_STATS = {
    booksReading: 3,
    highlights: 12,
    notes: 7,
    bookmarks: 5,
    aiQuestions: 24,
  };
  
  export function getDemoTopics(t: UIText): string[] {
    return [t.mySpaceTopicMachineLearning, t.mySpaceTopicClassicalAlgorithms, t.mySpaceTopicLinearAlgebra, t.mySpaceTopicAiCognition, t.mySpaceTopicIndianHistory];
  }

  export function getDemoActivity(t: UIText): LearningActivityEntry[] {
    return [
      { id: "demo-1", type: "quiz",      bookId: "artificial-intelligence-technology",  bookTitle: "Artificial Intelligence Technology", detail: t.mySpaceDemoDetailQuiz,      timestamp: Date.now() - 1000 * 60 * 25 },
      { id: "demo-2", type: "bookmark",  bookId: "nalanda",   bookTitle: "Nalanda",            detail: t.mySpaceDemoDetailBookmark,  timestamp: Date.now() - 1000 * 60 * 60 * 3 },
      { id: "demo-3", type: "note",      bookId: "artificial-intelligence-technology",  bookTitle: "Artificial Intelligence Technology",  detail: t.mySpaceDemoDetailNote,      timestamp: Date.now() - 1000 * 60 * 60 * 20 },
      { id: "demo-4", type: "highlight", bookId: "artificial-intelligence-technology",  bookTitle: "Artificial Intelligence Technology",  detail: t.mySpaceDemoDetailHighlight, timestamp: Date.now() - 1000 * 60 * 60 * 26 },
      { id: "demo-5", type: "open_book", bookId: "chandrayaan-3", bookTitle: "Chandrayaan-3",  detail: t.mySpaceDemoDetailOpenBook,  timestamp: Date.now() - 1000 * 60 * 60 * 48 },
    ];
  }

  // Templates contain a literal "{book}" placeholder the page splits on to
  // keep the book title in its own bold/colored span — Hindi/Tamil/Bengali/
  // Telugu/Marathi all place the object before the verb, the opposite order
  // from English, so a fixed "verb then book" layout can't be reused as-is.
  export function activityLabel(t: UIText, type: ActivityType): { icon: string; template: string } {
    const ACTIVITY_LABEL: Record<ActivityType, { icon: string; template: string }> = {
      highlight:  { icon: "⭐", template: t.mySpaceActivityHighlight },
      note:       { icon: "📝", template: t.mySpaceActivityNote },
      bookmark:   { icon: "🔖", template: t.mySpaceActivityBookmark },
      quiz:       { icon: "❓", template: t.mySpaceActivityQuiz },
      open_book:  { icon: "📖", template: t.mySpaceActivityOpenBook },
      ai_question:{ icon: "🤖", template: t.mySpaceActivityAiQuestion },
    };
    return ACTIVITY_LABEL[type];
  }
  
  // ── Full dashboard aggregate — everything the page needs, computed once ──
  export function buildMySpaceDashboard(directorBooks: DirectorBook[], t: UIText) {
    const highlights = loadHighlights();
    const notes = loadNotes();
    const bookmarks = loadBookmarks();
    const myLibrary = loadMyLibrary();
    const progressEntries = loadReadingProgress();
    const storedActivity = loadLearningActivity();
    const aiStats = loadAIUsageStats();
  
    // ── Continue Reading / Reading Progress: most recently read book ──────
    const sortedProgress = [...progressEntries].sort((a, b) => b.lastReadAt - a.lastReadAt);
    const hasRealProgress = sortedProgress.length > 0;
    const currentProgress: ReadingProgressEntry = hasRealProgress
      ? sortedProgress[0]
      : (() => {
          const fallbackBook = directorBooks[0];
          const total = bookTotalPages(fallbackBook);
          return {
            bookId: fallbackBook?.id ?? "nalanda",
            currentPage: Math.max(1, Math.round(total * 0.42)),
            totalPages: total,
            chapter: "Chapter 4",
            lastReadAt: Date.now() - 1000 * 60 * 45,
          };
        })();
    const currentBook = findBook(directorBooks, currentProgress.bookId) ?? directorBooks[0];
    const progressPct = Math.min(100, Math.round((currentProgress.currentPage / Math.max(1, currentProgress.totalPages)) * 100));
  
    // ── Estimated completion — simple, honest demo heuristic ───────────────
    const AVG_PAGES_PER_DAY = 15;
    const pagesRemaining = Math.max(0, currentProgress.totalPages - currentProgress.currentPage);
    const daysRemaining = Math.max(1, Math.ceil(pagesRemaining / AVG_PAGES_PER_DAY));
    const estimatedCompletionDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
  
    // ── Today's Learning cards — real counts, with a polished fallback
    // whenever a given metric has literally no data yet. ───────────────────
    const booksReadingCount = myLibrary.length > 0 ? myLibrary.length : (hasRealProgress ? sortedProgress.length : DEMO_STATS.booksReading);
    const stats = {
      booksReading: booksReadingCount,
      highlights: highlights.length > 0 ? highlights.length : DEMO_STATS.highlights,
      notes: notes.length > 0 ? notes.length : DEMO_STATS.notes,
      bookmarks: bookmarks.length > 0 ? bookmarks.length : DEMO_STATS.bookmarks,
      aiQuestions: aiStats.questionsAsked > 0 ? aiStats.questionsAsked : DEMO_STATS.aiQuestions,
    };
    const usingDemoStats = {
      booksReading: booksReadingCount === DEMO_STATS.booksReading && myLibrary.length === 0 && !hasRealProgress,
      highlights: highlights.length === 0,
      notes: notes.length === 0,
      bookmarks: bookmarks.length === 0,
      aiQuestions: aiStats.questionsAsked === 0,
    };
  
    // ── Recent Activity — merge real, timestamped events from highlights/
    // notes/bookmarks/stored-activity, then top up with demo entries only
    // if the real feed is thin. Most-recent-first. ─────────────────────────
    const derivedActivity: LearningActivityEntry[] = [
      ...highlights.map((h): LearningActivityEntry => ({
        id: `h-${h.id}`, type: "highlight", bookId: h.bookId,
        bookTitle: findBook(directorBooks, h.bookId)?.title,
        detail: `“${h.selectedText.slice(0, 60)}${h.selectedText.length > 60 ? "…" : ""}”`,
        page: h.page, timestamp: h.createdAt,
      })),
      ...notes.map((n): LearningActivityEntry => ({
        id: `n-${n.id}`, type: "note", bookId: n.bookId,
        bookTitle: findBook(directorBooks, n.bookId)?.title,
        detail: n.note.slice(0, 60) + (n.note.length > 60 ? "…" : ""),
        page: n.page, timestamp: n.createdAt,
      })),
      ...bookmarks.map((b): LearningActivityEntry => ({
        id: `b-${b.id}`, type: "bookmark", bookId: b.bookId,
        bookTitle: findBook(directorBooks, b.bookId)?.title,
        detail: b.title?.trim() || `${t.commonPage} ${b.page}`,
        page: b.page, timestamp: b.createdAt,
      })),
      ...storedActivity,
    ].sort((a, b) => b.timestamp - a.timestamp);
  
    const usingDemoActivity = derivedActivity.length < 3;
    const activity = (usingDemoActivity ? [...derivedActivity, ...getDemoActivity(t)] : derivedActivity)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  
    // ── Continue Studying — recently added/read books ──────────────────────
    const libraryBookIds = myLibrary.length > 0
      ? [...myLibrary].sort((a, b) => b.addedAt - a.addedAt).map(l => l.bookId)
      : (hasRealProgress ? sortedProgress.map(p => p.bookId) : directorBooks.slice(0, 3).map(b => b.id));
    const usingDemoLibrary = myLibrary.length === 0 && !hasRealProgress;
    const continueStudyingBooks = Array.from(new Set(libraryBookIds))
      .map(id => findBook(directorBooks, id))
      .filter((b): b is DirectorBook => !!b)
      .slice(0, 6);
  
    // ── AI Recommendations — related books + topics, based on current book.
    // Explicitly demo-quality per the brief. ────────────────────────────────
    const relatedBooks = directorBooks.filter(b => b.id !== currentBook?.id).slice(0, 3);
    const recommendedTopics = getDemoTopics(t).slice(0, 4);
    const suggestedNext = relatedBooks[0];

    return {
      greeting: getGreeting(t),
      currentBook, currentProgress, progressPct,
      daysRemaining, estimatedCompletionDate,
      stats, usingDemoStats,
      activity, usingDemoActivity,
      continueStudyingBooks, usingDemoLibrary,
      relatedBooks, recommendedTopics, suggestedNext,
    };
  }