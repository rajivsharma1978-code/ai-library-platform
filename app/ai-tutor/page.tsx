"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import PageHeader from "@/components/ui/PageHeader";
import QuickLinks from "@/components/ui/QuickLinks";
import AppButton from "@/components/ui/AppButton";

// ── Local types + helpers, self-contained on purpose (same pattern as
// app/my-books, app/my-library) — this page doesn't import from those
// pages or from the Reader/Study Workspace, it only reads the same
// localStorage keys and lib/directorBooks.ts. ──────────────────────────
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; lastReadAt: number; [k: string]: any; }
type DirectorBook = {
  id: string; title: string; author?: string; language?: string;
  description?: string; pages?: number | string; pdf?: string;
  cover?: string; coverUrl?: string; image?: string; thumbnail?: string;
  [k: string]: any;
};
type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function findBookById(id: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === id);
}
function bookCover(book?: DirectorBook): string | undefined {
  const c = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return c && c.trim() ? c : undefined;
}

// ── Cover: real image field → first PDF page rendered as cover → gradient
// + initials as the true last resort. Same technique as My Library/My Books. ──
function PdfFirstPageCover({ pdfPath, onFail }: { pdfPath: string; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument(pdfPath).promise;
        const page = await pdf.getPage(1);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = 400 / baseVp.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />;
}

function CoverThumb({ book, className = "" }: { book?: DirectorBook; className?: string }) {
  const staticCover = bookCover(book);
  const [staticFailed, setStaticFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  useEffect(() => { setStaticFailed(false); setPdfFailed(false); }, [book?.id]);
  const initials = (book?.title ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const canUseStatic = !!staticCover && !staticFailed;
  const canUsePdf = !canUseStatic && !!book?.pdf && !pdfFailed;

  if (canUseStatic) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={staticCover} alt={book?.title ? `Cover of ${book.title}` : "Book cover"} className={`object-cover ${className}`} onError={() => setStaticFailed(true)} />;
  }
  if (canUsePdf) {
    return (
      <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover"} className={`overflow-hidden bg-slate-100 ${className}`}>
        <PdfFirstPageCover pdfPath={book!.pdf as string} onFail={() => setPdfFailed(true)} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover placeholder"} className={`flex items-center justify-center bg-[linear-gradient(135deg,#f4d58d_0%,#c18a3f_60%,#8a5a24_100%)] text-white font-black ${className}`}>
      <span style={{ fontSize: "1.3em" }}>{initials || "📖"}</span>
    </div>
  );
}

// Fixed-height flex-column card so every card's CTA lines up on the same
// row regardless of title/author length — fixes the alignment
// inconsistency across book cards.
function BookCard({ book, t }: { book: DirectorBook; t: UIText }) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative h-56 w-full overflow-hidden rounded-2xl shadow">
        <CoverThumb book={book} className="h-full w-full" />
      </div>
      <h3 className="mt-3 truncate text-lg font-bold text-slate-900">{book.title}</h3>
      {book.author && <p className="truncate text-sm text-slate-500">{book.author}</p>}
      {book.language && (
        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{book.language}</p>
      )}
      <div className="mt-auto pt-4">
        <AppButton href={`/reader-premium?book=${book.id}`} fullWidth>
          🤖 {t.aiTutorStart}
        </AppButton>
        {/* Secondary, deliberately lightweight — AI Tutor stays the
            primary path on this page; this just avoids forcing AI on
            anyone who only wants to read. */}
        <AppButton href={`/read?book=${book.id}`} variant="ghost" size="sm" fullWidth className="mt-2">
          📖 {t.aiTutorOrReadNormally}
        </AppButton>
      </div>
    </div>
  );
}

export default function AiTutorPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);

  useEffect(() => {
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setMounted(true);
  }, []);

  // ── 1. Continue Learning — most recently read book, else Quantum ──────
  const continueBook = useMemo(() => {
    const sorted = [...progress].sort((a, b) => b.lastReadAt - a.lastReadAt);
    const fromProgress = sorted.length > 0 ? findBookById(sorted[0].bookId) : undefined;
    return fromProgress ?? findBookById("quantum") ?? (directorBooks as DirectorBook[])[0];
  }, [progress]);
  const continueProgressEntry = progress.find(p => p.bookId === continueBook?.id);
  const usingFallbackContinue = !continueProgressEntry;

  // ── 2. Recommended for Demo — Quantum, Nalanda, Chandrayaan (whichever
  // actually exist in the catalog today), excluding whatever's already
  // shown in Continue Learning so the same book doesn't appear twice. ────
  const recommended = useMemo(() => {
    const ids = ["quantum", "nalanda", "chandrayaan-3"];
    return ids
      .map(id => findBookById(id))
      .filter((b): b is DirectorBook => !!b && b.id !== continueBook?.id);
  }, [continueBook]);

  const quickLinks = [
    { href: "/", icon: "🏠", label: t.commonHome },
    { href: "/library", icon: "🏛️", label: t.navLibrary },
    { href: "/my-space", icon: "🧠", label: t.navMySpace },
    { href: "/my-library", icon: "📚", label: t.myLibraryTitle },
    { href: "/my-books", icon: "📖", label: t.myBooksTitle },
    { href: "/notes", icon: "📝", label: t.navNotes },
    { href: "/revision", icon: "🔄", label: t.navRevision },
    { href: "/analytics", icon: "📊", label: t.navAnalytics },
    { href: "/read", icon: "📤", label: t.uploadPdf },
  ];

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {t.commonLoading}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        <PageHeader title={t.navAiTutor} subtitle={t.aiTutorSubtitle} homeLabel={t.commonHome} />

        {/* 1. Continue Learning */}
        {continueBook && (
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">{t.aiTutorContinueLearning}</h2>
              {usingFallbackContinue && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  {t.aiTutorSuggested}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-5 rounded-[2rem] bg-white p-6 shadow ring-1 ring-black/5 sm:flex-row sm:items-center">
              <div className="mx-auto h-40 w-28 flex-shrink-0 overflow-hidden rounded-2xl shadow-lg sm:mx-0">
                <CoverThumb book={continueBook} className="h-full w-full" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                  {usingFallbackContinue ? t.aiTutorPopularWithLearners : t.aiTutorPickUpWhere}
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{continueBook.title}</h3>
                {continueBook.author && <p className="mt-1 text-sm text-slate-500">{continueBook.author}</p>}
                {continueProgressEntry && (
                  <p className="mt-1 text-sm text-slate-500">
                    {t.commonPage} {continueProgressEntry.currentPage} / {continueProgressEntry.totalPages}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-center">
                <Link
                  href={`/reader-premium?book=${continueBook.id}`}
                  className="inline-block rounded-full bg-amber-500 px-7 py-3 text-sm font-black text-white shadow-xl hover:bg-amber-600"
                >
                  🤖 {t.aiTutorStart}
                </Link>
                <Link
                  href={`/read?book=${continueBook.id}`}
                  className="mt-2 block text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  📖 {t.aiTutorOrReadNormally}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* 2. Recommended for Demo */}
        {recommended.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-black text-slate-900">{t.aiTutorRecommended}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {recommended.map(book => <BookCard key={book.id} book={book} t={t} />)}
            </div>
          </section>
        )}

        {/* 3 & 4. Upload Your Own PDF / Browse Full Library */}
        <section className="grid gap-5 sm:grid-cols-2">
          <Link
            href="/read"
            className="rounded-3xl bg-slate-900 p-8 text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <div className="text-3xl">📤</div>
            <h3 className="mt-3 text-xl font-black">{t.aiTutorUploadTitle}</h3>
            <p className="mt-2 text-sm text-slate-300">{t.aiTutorUploadDesc}</p>
          </Link>
          <Link
            href="/library"
            className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
          >
            <div className="text-3xl">🏛️</div>
            <h3 className="mt-3 text-xl font-black text-slate-900">{t.aiTutorBrowseTitle}</h3>
            <p className="mt-2 text-sm text-slate-600">{t.aiTutorBrowseDesc}</p>
          </Link>
        </section>

        {/* Quick Links / Shortcuts — compact, placed at the bottom so it
            never competes with the hero/Continue Learning above. */}
        <QuickLinks title={t.aiTutorQuickLinks} links={quickLinks} className="mt-10" />
      </div>
    </main>
  );
}
