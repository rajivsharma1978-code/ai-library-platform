"use client";

// ── Shared Book Cover ────────────────────────────────────────────────
// Single source of truth for the three-tier cover fallback that used to
// be copy-pasted (RealBookCover.tsx, and a local "CoverThumb"/
// "BookCoverThumb" re-implementation each in my-library, my-books,
// ai-tutor, and my-space) — same logic, four/five separate places to
// drift out of sync. Now imported everywhere instead.
//
// Tier 1: a real cover image field (cover/coverUrl/image/thumbnail).
// Tier 2: the book's own PDF, first page rendered to a <canvas> — this
//         IS the real cover for illustrated director books that were
//         never given a separate cover image asset (e.g. Chandrayaan 3),
//         so this tier is not just a placeholder, it's often the actual
//         artwork.
// Tier 3: initials on a gradient — the true last resort.
//
// Root-cause fix folded in here, found via a standalone Node repro
// against chandrayaan-3.pdf: getDocument/getPage/getViewport all resolve
// instantly, but page.getOperatorList() warned
// "UnknownErrorException: Ensure that the `standardFontDataUrl` API
// parameter is provided" — this book's cover page references a
// non-embedded standard PDF font, and without standardFontDataUrl
// pointing at pdf.js's bundled glyph data, rendering it hangs
// indefinitely instead of failing fast. Fixed by (a) passing
// standardFontDataUrl (glyph files copied to public/standard_fonts/,
// same pattern as the existing /pdf.worker.min.mjs) and (b) adding a
// bounded timeout as defense-in-depth so ANY PDF that still can't render
// its first page — for this or any other reason — reliably falls
// through to the initials tier instead of hanging forever.

import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

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

const PDF_RENDER_TIMEOUT_MS = 8000;

function resolveCoverUrl(book?: CoverableBook): string | undefined {
  const c = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return c && c.trim() ? c : undefined;
}

function PdfFirstPageCover({ pdfPath, onFail }: { pdfPath: string; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled || cancelled) return;
      settled = true;
      onFail();
    }, PDF_RENDER_TIMEOUT_MS);

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument({ url: pdfPath, standardFontDataUrl: "/standard_fonts/" }).promise;
        const page = await pdf.getPage(1);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = 300 / baseVp.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled || settled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setRendered(true);
      } catch {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        onFail();
      }
    })();

    return () => { cancelled = true; clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }}
    />
  );
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
        className={`object-cover ${className}`}
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
