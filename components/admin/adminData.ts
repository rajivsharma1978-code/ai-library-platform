// ── Admin data layer ────────────────────────────────────────────────────
// Demo/localStorage only, per the brief — no backend. Shared between
// app/admin/page.tsx (dashboard) and app/admin/book-management/page.tsx
// so both read/write the exact same shape and never drift apart.
//
// Design note: lib/directorBooks.ts is the real book catalog, but it's a
// static TypeScript file — this admin panel can't actually edit or delete
// entries in it. Instead, every catalog book can have an OVERRIDE stored
// here (edited fields, or a "removed" flag that hides it from the admin's
// view without touching the real file). Fully admin-created ("custom")
// books live entirely in this override list. buildDisplayBooks() merges
// the two into one list for both pages to render.

export type BookStatus = "Published" | "Draft" | "Pending" | "Under Review";

export interface AdminBookOverride {
  id: string;
  title?: string;
  author?: string;
  language?: string;
  category?: string;
  status?: BookStatus;
  format?: string;
  pages?: number;
  /** Demo-only — the Book Management upload UI never actually uploads a
   *  file, it just remembers the chosen filename so the form/list feels
   *  real. */
  coverFileName?: string;
  pdfFileName?: string;
  /** A REAL uploaded PDF, as a data: URL — set when this override came
   *  from an Upload Queue approval (see app/admin/upload-queue), so the
   *  public catalog can actually open/read the book instead of just
   *  showing its metadata. Optional — Book Management's own mock upload
   *  never sets this, so those books remain metadata-only as before. */
  pdfDataUrl?: string;
  /** true = this book exists ONLY here (not in lib/directorBooks.ts). */
  isCustom?: boolean;
  /** true = "deleted" from the admin's point of view. Catalog books can't
   *  really be removed from the static file, so this just hides them. */
  removed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DisplayBook {
  id: string;
  title: string;
  author: string;
  language: string;
  category: string;
  status: BookStatus;
  format: string;
  pages: number;
  coverFileName?: string;
  pdfFileName?: string;
  isCustom: boolean;
}

export type ActivityType = "add" | "edit" | "delete" | "upload" | "ai" | "moderation";
export interface AdminActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: number;
}

export type AIFeature = "explain" | "summarize" | "translate" | "quiz" | "flashcards" | "revision";

export interface AIUsageStats {
  questionsAsked: number;
  lastUsedAt?: number;
  /** Per-feature counts — optional so any pre-existing ndl_ai_usage_stats
   *  value (just {questionsAsked, lastUsedAt}) keeps parsing unchanged. */
  byFeature?: Partial<Record<AIFeature, number>>;
}

const KEYS = {
  books: "ndl_admin_books",
  activity: "ndl_admin_activity",
  aiUsage: "ndl_ai_usage_stats",
} as const;

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function loadBookOverrides(): AdminBookOverride[] { return readArray<AdminBookOverride>(KEYS.books); }
export function saveBookOverrides(list: AdminBookOverride[]) { writeArray(KEYS.books, list); }

export function loadActivity(): AdminActivityEntry[] { return readArray<AdminActivityEntry>(KEYS.activity); }
export function saveActivity(list: AdminActivityEntry[]) { writeArray(KEYS.activity, list); }
/** Prepends a new entry (most-recent-first), capped at 50 so the log
 *  never grows unbounded in localStorage. */
export function logActivity(type: ActivityType, message: string) {
  const next = [
    { id: newId("act"), type, message, timestamp: Date.now() },
    ...loadActivity(),
  ].slice(0, 50);
  saveActivity(next);
  return next;
}

/** Read-only here — this is the same key/shape My Space reads; nothing
 *  in this admin panel writes to it (no feature yet actually increments
 *  real AI usage), so it's shown as-is with a demo fallback when empty. */
export function loadAIUsage(): AIUsageStats {
  if (typeof window === "undefined") return { questionsAsked: 0 };
  try {
    const raw = window.localStorage.getItem(KEYS.aiUsage);
    return raw ? JSON.parse(raw) : { questionsAsked: 0 };
  } catch { return { questionsAsked: 0 }; }
}

/** Call this after a REAL AI response succeeds (Explain, Summarize,
 *  Translate, Quiz, Flashcards, Revision) — increments the total count
 *  used across the app, bumps that feature's own count, and stamps
 *  lastUsedAt, so Admin → AI Usage reflects genuine usage instead of a
 *  number nothing ever writes to. */
export function trackAIUsage(feature: AIFeature) {
  if (typeof window === "undefined") return;
  const current = loadAIUsage();
  const byFeature = { ...current.byFeature };
  byFeature[feature] = (byFeature[feature] || 0) + 1;
  const next: AIUsageStats = {
    questionsAsked: (current.questionsAsked || 0) + 1,
    lastUsedAt: Date.now(),
    byFeature,
  };
  try { window.localStorage.setItem(KEYS.aiUsage, JSON.stringify(next)); } catch {}
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

type DirectorBookLike = { id: string; title: string; author?: string; language?: string; pages?: number | string; [k: string]: any };

export function buildDisplayBooks(catalog: DirectorBookLike[], overrides: AdminBookOverride[]): DisplayBook[] {
  const overrideMap = new Map(overrides.map(o => [o.id, o]));

  const fromCatalog: DisplayBook[] = catalog
    .map((b): DisplayBook | null => {
      const o = overrideMap.get(b.id);
      if (o?.removed) return null;
      return {
        id: b.id,
        title: o?.title ?? b.title,
        author: o?.author ?? b.author ?? "",
        language: o?.language ?? b.language ?? "English",
        category: o?.category ?? "General",
        status: o?.status ?? "Published",
        format: o?.format ?? "PDF",
        pages: o?.pages ?? (Number(b.pages) || 0),
        coverFileName: o?.coverFileName,
        pdfFileName: o?.pdfFileName,
        isCustom: false,
      };
    })
    .filter((b): b is DisplayBook => b !== null);

  const customBooks: DisplayBook[] = overrides
    .filter(o => o.isCustom && !o.removed)
    .map((o): DisplayBook => ({
      id: o.id,
      title: o.title || "Untitled Book",
      author: o.author || "",
      language: o.language || "English",
      category: o.category || "General",
      status: o.status || "Draft",
      format: o.format || "PDF",
      pages: o.pages || 0,
      coverFileName: o.coverFileName,
      pdfFileName: o.pdfFileName,
      isCustom: true,
    }));

  return [...fromCatalog, ...customBooks];
}

// ══════════════════════════════════════════════════════════════════════
// New keys for this batch — Users / Languages / Upload Queue / Moderation
// / Accessibility. Same demo/localStorage-only approach as the rest of
// this file: read a key, seed a polished demo default if it's genuinely
// empty, otherwise show/act on whatever's really stored.
// ══════════════════════════════════════════════════════════════════════
const BATCH2_KEYS = {
  users: "ndl_admin_users",
  languages: "ndl_admin_languages",
  uploadQueue: "ndl_admin_upload_queue",
  moderation: "ndl_admin_moderation",
  accessibility: "ndl_admin_accessibility",
} as const;

// ── Users ────────────────────────────────────────────────────────────
export type UserRole = "Student" | "Teacher" | "Researcher" | "Senior Learner" | "Admin";
export type UserStatus = "Active" | "Suspended";
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  joinedAt: number;
}
const DEMO_USERS: AdminUser[] = [
  { id: "u-1", name: "Aditi Sharma",  email: "aditi.sharma@example.com",  role: "Student",        status: "Active",    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 40 },
  { id: "u-2", name: "Rohan Mehta",   email: "rohan.mehta@example.com",   role: "Teacher",        status: "Active",    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 120 },
  { id: "u-3", name: "Priya Nair",    email: "priya.nair@example.com",    role: "Researcher",     status: "Active",    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 12 },
  { id: "u-4", name: "Vikram Rao",    email: "vikram.rao@example.com",    role: "Senior Learner",  status: "Suspended",  joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 200 },
  { id: "u-5", name: "Ananya Iyer",   email: "ananya.iyer@example.com",   role: "Student",        status: "Active",    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 3 },
];
export function loadUsers(): AdminUser[] {
  const list = readArray<AdminUser>(BATCH2_KEYS.users);
  return list.length > 0 ? list : DEMO_USERS;
}
export function saveUsers(list: AdminUser[]) { writeArray(BATCH2_KEYS.users, list); }
export function usingDemoUsers(): boolean { return readArray<AdminUser>(BATCH2_KEYS.users).length === 0; }

// ── Languages ────────────────────────────────────────────────────────
export interface AdminLanguageSetting {
  language: string;
  enabled: boolean;
  targetCoveragePercent: number;
}
// All six start enabled — the app's own homepage advertises Indian-
// language support as a headline feature, so the primary language
// switcher shouldn't start out artificially limited. The Admin →
// Languages enable/disable toggle still fully works from here; this only
// changes the out-of-the-box starting state, not the feature itself.
const DEMO_LANGUAGE_SETTINGS: AdminLanguageSetting[] = [
  { language: "English", enabled: true, targetCoveragePercent: 100 },
  { language: "Hindi",   enabled: true, targetCoveragePercent: 90 },
  { language: "Tamil",   enabled: true, targetCoveragePercent: 75 },
  { language: "Bengali", enabled: true, targetCoveragePercent: 75 },
  { language: "Marathi", enabled: true, targetCoveragePercent: 60 },
  { language: "Telugu",  enabled: true, targetCoveragePercent: 60 },
];
export function loadLanguageSettings(): AdminLanguageSetting[] {
  const list = readArray<AdminLanguageSetting>(BATCH2_KEYS.languages);
  return list.length > 0 ? list : DEMO_LANGUAGE_SETTINGS;
}
export function saveLanguageSettings(list: AdminLanguageSetting[]) { writeArray(BATCH2_KEYS.languages, list); }
export function usingDemoLanguageSettings(): boolean { return readArray<AdminLanguageSetting>(BATCH2_KEYS.languages).length === 0; }

// ── Upload Queue ─────────────────────────────────────────────────────
export type UploadQueueStatus = "Processing" | "Ready for Review" | "Approved" | "Rejected";
export interface UploadQueueItem {
  id: string;
  fileName: string;
  bookTitleGuess: string;
  status: UploadQueueStatus;
  submittedAt: number;
  /** Real uploaded PDF as a data: URL, plus its page count — both
   *  optional so the seeded demo queue items (which never had a real
   *  file) keep working unchanged. Set by a real file upload; carried
   *  into the AdminBookOverride on Approve. */
  pdfDataUrl?: string;
  pages?: number;
}
const DEMO_UPLOAD_QUEUE: UploadQueueItem[] = [
  { id: "up-1", fileName: "cyber-security-basics.pdf", bookTitleGuess: "Cyber Security Basics",      status: "Ready for Review", submittedAt: Date.now() - 1000 * 60 * 60 * 2 },
  { id: "up-2", fileName: "indian-history-archive.pdf", bookTitleGuess: "Indian History Archive",     status: "Processing",       submittedAt: Date.now() - 1000 * 60 * 30 },
  { id: "up-3", fileName: "marathi-science-textbook.pdf", bookTitleGuess: "Marathi Science Textbook", status: "Ready for Review", submittedAt: Date.now() - 1000 * 60 * 60 * 26 },
];
export function loadUploadQueue(): UploadQueueItem[] {
  const list = readArray<UploadQueueItem>(BATCH2_KEYS.uploadQueue);
  return list.length > 0 ? list : DEMO_UPLOAD_QUEUE;
}
export function saveUploadQueue(list: UploadQueueItem[]) { writeArray(BATCH2_KEYS.uploadQueue, list); }
export function usingDemoUploadQueue(): boolean { return readArray<UploadQueueItem>(BATCH2_KEYS.uploadQueue).length === 0; }

// ── Moderation ───────────────────────────────────────────────────────
export type ModerationSeverity = "Low" | "Medium" | "High";
export type ModerationStatus = "Open" | "Resolved";
export interface ModerationFlag {
  id: string;
  subject: string;
  reason: string;
  severity: ModerationSeverity;
  status: ModerationStatus;
  flaggedAt: number;
}
const DEMO_MODERATION: ModerationFlag[] = [
  { id: "mod-1", subject: "Quantum Computing",       reason: "Flagged for language tagging review", severity: "Low",    status: "Open", flaggedAt: Date.now() - 1000 * 60 * 60 * 20 },
  { id: "mod-2", subject: "User comment on Nalanda",  reason: "Reported as off-topic",                severity: "Medium", status: "Open", flaggedAt: Date.now() - 1000 * 60 * 60 * 5 },
  { id: "mod-3", subject: "Uploaded PDF (Chandrayaan)", reason: "OCR quality below threshold",        severity: "Low",    status: "Open", flaggedAt: Date.now() - 1000 * 60 * 60 * 48 },
];
export function loadModeration(): ModerationFlag[] {
  const list = readArray<ModerationFlag>(BATCH2_KEYS.moderation);
  return list.length > 0 ? list : DEMO_MODERATION;
}
export function saveModeration(list: ModerationFlag[]) { writeArray(BATCH2_KEYS.moderation, list); }
export function usingDemoModeration(): boolean { return readArray<ModerationFlag>(BATCH2_KEYS.moderation).length === 0; }

// ── Accessibility ────────────────────────────────────────────────────
export type AccessibilityStatus = "Pass" | "Needs Work" | "Not Started";
export interface AccessibilityCheckItem {
  id: string;
  label: string;
  status: AccessibilityStatus;
}
const DEMO_ACCESSIBILITY: AccessibilityCheckItem[] = [
  { id: "a11y-1", label: "Alt text for book covers",              status: "Pass" },
  { id: "a11y-2", label: "Screen reader labels on Reader controls", status: "Pass" },
  { id: "a11y-3", label: "Keyboard navigation across the Reader",   status: "Needs Work" },
  { id: "a11y-4", label: "Color contrast on AI Companion panel",   status: "Pass" },
  { id: "a11y-5", label: "Captions/transcripts for Read Aloud",     status: "Not Started" },
  { id: "a11y-6", label: "Multilingual screen-reader support",      status: "Needs Work" },
];
export function loadAccessibility(): AccessibilityCheckItem[] {
  const list = readArray<AccessibilityCheckItem>(BATCH2_KEYS.accessibility);
  return list.length > 0 ? list : DEMO_ACCESSIBILITY;
}
export function saveAccessibility(list: AccessibilityCheckItem[]) { writeArray(BATCH2_KEYS.accessibility, list); }
export function usingDemoAccessibility(): boolean { return readArray<AccessibilityCheckItem>(BATCH2_KEYS.accessibility).length === 0; }