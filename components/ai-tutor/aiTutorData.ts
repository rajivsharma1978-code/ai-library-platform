// ── AI Tutor dashboard — data layer ─────────────────────────────────────
// Reuses My Space's existing localStorage readers (components/my-space/
// mySpaceData.ts) instead of re-implementing them — same ndl_highlights /
// ndl_notes / ndl_bookmarks / ndl_reading_progress / ndl_learning_activity
// keys the Reader/Study Workspace and My Space already read, read-only
// here too. No new storage schema is introduced except where explicitly
// noted below (all additive, never written by any other feature).

import {
  loadHighlights, loadNotes, loadBookmarks, loadReadingProgress, loadLearningActivity,
  findBook, bookTotalPages,
  type DirectorBook, type ReadingProgressEntry,
} from "@/components/my-space/mySpaceData";

function readLocalNumber(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Study streak — derived from EXISTING timestamped activity (highlight/
// note/bookmark createdAt, reading-progress lastReadAt), never a new
// persisted counter. Counts consecutive calendar days, walking back from
// today, that have at least one real activity timestamp. ─────────────────
function computeStudyStreakDays(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = new Set(timestamps.map(dayKey));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (!days.has(dayKey(cursor.getTime()))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface AiTutorStats {
  readingTimeMinutes: number;
  readingGoalMinutes: number;
  studyStreakDays: number;
  quizzesCompleted: number;
  notesCreated: number;
  booksInProgress: number;
}
export interface AiTutorUsingDemoStats {
  readingTime: boolean;
  studyStreak: boolean;
  quizzesCompleted: boolean;
  notesCreated: boolean;
  booksInProgress: boolean;
}
export interface AiTutorDashboard {
  continueBook: DirectorBook | undefined;
  continueProgress: ReadingProgressEntry | undefined;
  usingFallbackContinue: boolean;
  stats: AiTutorStats;
  usingDemoStats: AiTutorUsingDemoStats;
  recommended: DirectorBook[];
}

// Polished fallbacks — used ONLY when a given metric has no real data at
// all yet, same "demo, clearly labelled" convention as My Space's own
// DEMO_STATS (components/my-space/mySpaceData.ts).
const DEMO = {
  readingTimeMinutes: 18,
  readingGoalMinutes: 30,
  studyStreakDays: 6,
  quizzesCompleted: 3,
  notesCreated: 7,
  booksInProgress: 3,
};

export function buildAiTutorDashboard(catalogBooks: DirectorBook[]): AiTutorDashboard {
  const highlights = loadHighlights();
  const notes = loadNotes();
  const bookmarks = loadBookmarks();
  const progressEntries = loadReadingProgress();
  const activity = loadLearningActivity();

  // ── Continue Learning — most recently read book, else a seed book,
  // else whatever the merged catalog has first. ──────────────────────────
  const sortedProgress = [...progressEntries].sort((a, b) => b.lastReadAt - a.lastReadAt);
  const continueBook = (sortedProgress.length > 0 ? findBook(catalogBooks, sortedProgress[0].bookId) : undefined)
    ?? findBook(catalogBooks, "artificial-intelligence-technology")
    ?? catalogBooks[0];
  const continueProgress = progressEntries.find(p => p.bookId === continueBook?.id);
  const usingFallbackContinue = !continueProgress;

  // ── Today's Progress ────────────────────────────────────────────────
  const quizzesCompleted = readLocalNumber("aiCompletedQuizzes");
  const notesCreated = notes.length;
  const booksInProgress = progressEntries.length;
  const streakTimestamps = [
    ...highlights.map(h => h.createdAt),
    ...notes.map(n => n.createdAt),
    ...bookmarks.map(b => b.createdAt),
    ...activity.map(a => a.timestamp),
    ...progressEntries.map(p => p.lastReadAt),
  ];
  const studyStreakDays = computeStudyStreakDays(streakTimestamps);

  const stats: AiTutorStats = {
    readingTimeMinutes: DEMO.readingTimeMinutes, // no real "time spent reading" source exists anywhere yet
    readingGoalMinutes: DEMO.readingGoalMinutes,
    studyStreakDays: studyStreakDays > 0 ? studyStreakDays : DEMO.studyStreakDays,
    quizzesCompleted: quizzesCompleted > 0 ? quizzesCompleted : DEMO.quizzesCompleted,
    notesCreated: notesCreated > 0 ? notesCreated : DEMO.notesCreated,
    booksInProgress: booksInProgress > 0 ? booksInProgress : DEMO.booksInProgress,
  };
  const usingDemoStats = {
    readingTime: true, // always demo — never a real source to compute this from
    studyStreak: studyStreakDays === 0,
    quizzesCompleted: quizzesCompleted === 0,
    notesCreated: notesCreated === 0,
    booksInProgress: booksInProgress === 0,
  };

  // ── Recommended for You — same seed-then-extend approach the previous
  // AI Tutor page already used, so a newly-published catalog book (e.g.
  // admin-approved from the Upload Queue) still surfaces here. ───────────
  const seedIds = ["artificial-intelligence-technology", "nalanda", "chandrayaan-3"];
  const seeded = seedIds.map(id => findBook(catalogBooks, id)).filter((b): b is DirectorBook => !!b);
  const extra = catalogBooks.filter(b => !seedIds.includes(b.id));
  const recommended = [...seeded, ...extra]
    .filter(b => b.id !== continueBook?.id)
    .slice(0, 6);

  return {
    continueBook, continueProgress, usingFallbackContinue,
    stats, usingDemoStats,
    recommended,
  };
}

export { bookTotalPages, findBook };
export type { DirectorBook, ReadingProgressEntry };
