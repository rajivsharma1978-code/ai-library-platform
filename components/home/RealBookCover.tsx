"use client";

import { useEffect, useRef, useState } from "react";

// ── Shared across FeaturedBooks / NewArrivals / DirectorCollection so all
// three homepage sections show the SAME real covers, using the same
// three-tier fallback already proven in My Library / My Books / AI Tutor:
// real cover field → first PDF page rendered as a cover → gradient +
// initials as the true last resort. Self-contained (its own pdfjs-dist
// load) — doesn't import from or modify the Reader in any way.
type DirectorBookLike = {
  id: string; title: string;
  cover?: string; coverUrl?: string; image?: string; thumbnail?: string;
  pdf?: string;
  [k: string]: any;
};

function bookCover(book?: DirectorBookLike): string | undefined {
  const c = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return c && c.trim() ? c : undefined;
}

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
        const scale = 300 / baseVp.width;
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

export default function RealBookCover({ book, className = "" }: { book?: DirectorBookLike; className?: string }) {
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
    <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover placeholder"} className={`flex items-center justify-center bg-gradient-to-br from-amber-200 via-orange-300 to-slate-700 text-white font-black ${className}`}>
      <span style={{ fontSize: "1.2em" }}>{initials || "📖"}</span>
    </div>
  );
}
