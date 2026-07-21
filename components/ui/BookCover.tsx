"use client";

// ── Shared Book Cover ────────────────────────────────────────────────
// Single source of truth for the three-tier cover fallback that used to
// be copy-pasted (RealBookCover.tsx, and a local "CoverThumb"/
// "BookCoverThumb" re-implementation each in my-library, my-books,
// ai-tutor, and my-space) — same logic, four/five separate places to
// drift out of sync. Now imported everywhere instead.
//
// Tier 1: a real cover image field (cover/coverUrl/image/thumbnail) —
//         for the three launch titles this is a pre-generated static
//         asset in public/book-covers/ (see lib/directorBooks.ts), not
//         a live render.
// Tier 2: lib/coverManager's cached PDF-first-page renderer — the
//         fallback for any book that doesn't have a Tier-1 asset yet
//         (a future upload before an admin promotes its generated cover
//         to permanent storage). Renders once per PDF, then serves
//         every subsequent request — anywhere in the app — from cache
//         instead of re-rendering the PDF on every mount.
// Tier 3: initials on a gradient — the true last resort.
//
// Root-cause fix for the underlying render, found via a standalone Node
// repro against chandrayaan-3.pdf: getDocument/getPage/getViewport all
// resolve instantly, but page.getOperatorList() warned
// "UnknownErrorException: Ensure that the `standardFontDataUrl` API
// parameter is provided" — this book's cover page references a
// non-embedded standard PDF font, and without standardFontDataUrl
// pointing at pdf.js's bundled glyph data, rendering it hangs
// indefinitely instead of failing fast. Fixed in coverManager by
// passing standardFontDataUrl (glyph files copied to
// public/standard_fonts/, same pattern as the existing
// /pdf.worker.min.mjs).

import { useEffect, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { getCachedCoverForPdf } from "@/lib/coverManager";

export type CoverableBook = {
  id?: string;
  title?: string;
  cover?: string;
  coverUrl?: string;
  image?: string;
  thumbnail?: string;
  pdf?: string;
  [k: string]: any;
};

// Only a ceiling on how long THIS mount waits before showing the Tier-3
// fallback — the underlying generateCoverFromPdf() call isn't cancelled
// when this fires, so a slow first-ever render still finishes and
// populates the cache, benefiting the very next mount even if this one
// already gave up and moved on.
const PDF_RENDER_TIMEOUT_MS = 8000;

function resolveCoverUrl(book?: CoverableBook): string | undefined {
  const c = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return c && c.trim() ? c : undefined;
}

function PdfFirstPageCover({ pdfPath, onFail }: { pdfPath: string; onFail: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled || cancelled) return;
      settled = true;
      onFail();
    }, PDF_RENDER_TIMEOUT_MS);

    getCachedCoverForPdf(pdfPath)
      .then((url) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setDataUrl(url);
      })
      .catch(() => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        onFail();
      });

    return () => { cancelled = true; clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath]);

  if (!dataUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />;
}

export default function BookCover({ book, className = "" }: { book?: CoverableBook; className?: string }) {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const staticCover = resolveCoverUrl(book);
  const [staticFailed, setStaticFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  useEffect(() => { setStaticFailed(false); setPdfFailed(false); }, [book?.id]);
  const initials = (book?.title ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const canUseStatic = !!staticCover && !staticFailed;
  const canUsePdf = !canUseStatic && !!book?.pdf && !pdfFailed;
  const coverOfTitle = book?.title ? t.bookCoverOf.replace("{title}", book.title) : undefined;

  if (canUseStatic) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={staticCover}
        alt={coverOfTitle ?? t.bookCoverGeneric}
        className={`object-contain ${className}`}
        loading="lazy"
        decoding="async"
        onError={() => setStaticFailed(true)}
      />
    );
  }
  if (canUsePdf) {
    return (
      <div role="img" aria-label={coverOfTitle ?? t.bookCoverGeneric} className={`overflow-hidden bg-slate-100 ${className}`}>
        <PdfFirstPageCover pdfPath={book!.pdf as string} onFail={() => setPdfFailed(true)} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={coverOfTitle ?? t.bookCoverPlaceholder} className={`flex items-center justify-center bg-gradient-to-br from-amber-200 via-orange-300 to-slate-700 text-white font-black ${className}`}>
      <span style={{ fontSize: "1.2em" }}>{initials || "📖"}</span>
    </div>
  );
}
