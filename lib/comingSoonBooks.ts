// ── Coming-soon preview entries ─────────────────────────────────────
// The live demo catalogue has exactly three fully-working books. Rather
// than let the Home page discovery rails visibly announce that (a large
// empty gap on wide screens, or an explicit "DEMO" label), each rail also
// shows a handful of these — real-sounding future NDL AI titles with no
// backing PDF, rendered through the same BookCover component but muted
// and non-interactive. They're never routed anywhere: no /library entry,
// no reader page, no admin record. Titles are deliberately not run
// through the i18n system, matching every other book title/author in
// this app (lib/directorBooks.ts) — a book's name is real-world data,
// not UI chrome.
export interface ComingSoonBook {
  id: string;
  title: string;
  author: string;
}

export const comingSoonBooks: ComingSoonBook[] = [
  { id: "coming-panchatantra", title: "Panchatantra: Timeless Tales", author: "NDL AI" },
  { id: "coming-constitution", title: "The Constitution of India: A Reader's Guide", author: "NDL AI" },
  { id: "coming-ramayana", title: "Ramayana for Young Readers", author: "NDL AI" },
  { id: "coming-ncert-science", title: "NCERT Science Companion", author: "NDL AI" },
  { id: "coming-classical-music", title: "The Art of Indian Classical Music", author: "NDL AI" },
];
