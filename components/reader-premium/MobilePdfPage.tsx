"use client";

// ── P0: Dedicated mobile PDF renderer ───────────────────────────────────
// Mounted ONLY below the 640px viewport threshold (see isMobileViewport in
// PremiumReaderPreviewContent) as a full replacement for PdfBookSpread on
// that path — desktop/tablet keep PdfBookSpread completely unchanged.
//
// Why this is a different approach from the reverted Phase C1D experiment,
// not a repeat of it: C1D kept PdfBookSpread's entire pipeline intact for
// mobile (an offscreen 2×/1.5× raster canvas, a full-page getImageData()
// whitespace-crop scan, a copy from that offscreen canvas onto a second
// differently-sized visible canvas, a pdf.js renderTextLayer() text-layer
// build, and sequential neighbor-page preloading) and only tuned numbers
// inside it (lower offscreen scale, a max-dimension cap, forced single-page
// mode). It still failed on both iPhone Safari and Samsung Android. This
// component does not tune that pipeline — it does not run it at all. There
// is exactly one canvas, one direct pdf.js `page.render()` call onto it, no
// getImageData anywhere, no second canvas, no text layer, no preloading.
// Every step that plausibly caused the original failure (large synchronous
// pixel reads, double-canvas compositing, extra concurrent work per page)
// is absent by construction rather than reduced in magnitude.
//
// ── TEMPORARY: real-device stage diagnostics ─────────────────────────────
// Real-device testing (iPhone Safari, iPhone Chrome) still shows the Retry
// failure with no way to see WHERE in the pipeline it's failing, since the
// dev-tools/console isn't available on-device. Everything under
// "DIAGNOSTICS STATE" below renders a visible, on-screen diagnostic card
// instead — same information a console.log would have carried, just shown
// in the UI so it can be read or screenshotted directly off the phone. This
// is intentionally temporary: it changes nothing about the render pipeline,
// timeout duration, or retry behavior — it only observes and displays.
import { useCallback, useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export type MobilePdfPageProps = {
  pdfPath: string;
  /** Diagnostics-only — identifies which book this render belongs to in
   *  the on-screen diagnostic card. Not used by the render pipeline itself. */
  bookId?: string;
  pageNumber: number;
  totalPages: number;
  zoom?: number;
  pan?: { x: number; y: number };
  isPanning?: boolean;
  /** Resolves to an already-cached pdf.js document (keyed by book) owned
   *  by the parent — see PremiumReaderPreviewContent's getSharedPdfDocument.
   *  Reusing it means this component never opens its own second copy of
   *  the same PDF; the parent's AI text-extraction path and this renderer
   *  share the exact same fetch/parse. */
  getPdfDocument: () => Promise<any>;
  /** Same shape as PdfBookSpread's onTextExtracted — plain pdf.js
   *  page.getTextContent() output, fired AFTER the canvas is visible and
   *  never blocking it. No text-selection layer is built from this; it
   *  only feeds AI Companion / Read Aloud's existing pageTexts state. */
  onTextExtracted?: (texts: Record<number, string>) => void;
};

// Matches PdfBookSpread's own render-timeout contract (see that file's
// "Render timeout / retry safety net" comment) so mobile gets an
// equivalent, not weaker, safety net: bounded per attempt, one automatic
// retry, then a visible, user-actionable failure state — never a silent
// indefinite spinner.
const RENDER_TIMEOUT_MS = 12000;
const RENDER_MAX_ATTEMPTS = 2;

// Conservative device-pixel-ratio cap — real mobile devices commonly
// report 2–3, which would otherwise triple/quadruple canvas pixel count
// for no visible benefit at phone viewing distance. 1.5 keeps the page
// legible while keeping the backing-store small.
const DPR_CAP = 1.5;
// Defensive backstop only — guards an unusual PDF with a very narrow
// native page width from producing an oversized canvas; ordinary mobile
// container widths (≤ 640 CSS px) combined with DPR_CAP never get close
// to this on their own.
const MAX_RENDER_SCALE = 3;

// The card's own padding (Tailwind p-2 → 0.5rem = 8px per side) — kept as
// a named constant, subtracted from the measured card width, so the
// canvas's target CSS width is the actual available content box, not the
// padded box (which would overflow it).
const CARD_PADDING_PX = 16;

// Resize/measurement noise smaller than this is ignored — avoids a
// re-render loop from sub-pixel layout jitter.
const WIDTH_CHANGE_THRESHOLD_PX = 4;

function isCancelledError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as any).name === "RenderingCancelledException";
}

// ── DIAGNOSTICS STATE (temporary) ────────────────────────────────────────
type Stage =
  | "component-mounted"
  | "measuring-container"
  | "loading-document"
  | "document-loaded"
  | "loading-page"
  | "page-loaded"
  | "canvas-ready"
  | "render-started"
  | "render-completed"
  | "visible"
  | "failed"
  | "timed-out";

interface Diagnostics {
  stage: Stage;
  containerWidth: number | null;
  dpr: number | null;
  docLoadStartedAt: number | null;
  docLoadCompletedAt: number | null;
  pageLoadStartedAt: number | null;
  pageLoadCompletedAt: number | null;
  nativeVpW: number | null;
  nativeVpH: number | null;
  displayScale: number | null;
  renderScale: number | null;
  canvasW: number | null;
  canvasH: number | null;
  canvasMounted: boolean | null;
  renderStartedAt: number | null;
  renderCompletedAt: number | null;
  timeoutFired: boolean;
  errorName: string | null;
  errorMessage: string | null;
  attemptNumber: number;
}

function initialDiagnostics(stage: Stage): Diagnostics {
  return {
    stage,
    containerWidth: null,
    dpr: null,
    docLoadStartedAt: null,
    docLoadCompletedAt: null,
    pageLoadStartedAt: null,
    pageLoadCompletedAt: null,
    nativeVpW: null,
    nativeVpH: null,
    displayScale: null,
    renderScale: null,
    canvasW: null,
    canvasH: null,
    canvasMounted: null,
    renderStartedAt: null,
    renderCompletedAt: null,
    timeoutFired: false,
    errorName: null,
    errorMessage: null,
    attemptNumber: 1,
  };
}

function DiagnosticRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/10 py-0.5 last:border-b-0">
      <span className="text-amber-300/80">{label}</span>
      <span className="text-right text-white break-all">{value ?? "—"}</span>
    </div>
  );
}

export default function MobilePdfPage({
  pdfPath, bookId, pageNumber, totalPages, zoom = 100, pan = { x: 0, y: 0 }, isPanning = false,
  getPdfDocument, onTextExtracted,
}: MobilePdfPageProps) {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const renderIdRef = useRef(0);
  const mountedAtRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : Date.now());

  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [diag, setDiag] = useState<Diagnostics>(() => initialDiagnostics("component-mounted"));
  const [, forceTick] = useState(0);

  const safePage = Math.max(1, Math.min(Math.floor(pageNumber) || 1, Math.max(1, Math.floor(totalPages) || 1)));

  const patchDiag = useCallback((patch: Partial<Diagnostics>) => {
    setDiag((prev) => ({ ...prev, ...patch }));
  }, []);

  // Live-updating elapsed-ms ticker while still in flight — purely visual,
  // so a phone screen shows the counter moving instead of a frozen number
  // while waiting on a slow/stuck stage.
  useEffect(() => {
    if (diag.stage === "visible" || diag.stage === "failed") return;
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [diag.stage]);

  // ── Measure the card's available content width ──────────────────────
  // Two independent sources feed the same measure() call: ResizeObserver
  // (the normal, event-driven path) AND a short setTimeout poll (a
  // fallback in case ResizeObserver notifications are ever delayed —
  // e.g. a backgrounded/throttled tab, which still fires setTimeout,
  // just clamped, unlike requestAnimationFrame which some environments
  // suspend entirely for hidden tabs). The poll stops once it's gotten a
  // few consecutive readings, so it's a one-time startup safety net, not
  // an ongoing timer.
  useEffect(() => {
    patchDiag({ stage: "measuring-container", dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : null });
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const card = cardEl;
    let last = 0;
    let cancelled = false;
    function measure(width: number) {
      const next = Math.max(0, width - CARD_PADDING_PX * 2);
      if (Math.abs(next - last) < WIDTH_CHANGE_THRESHOLD_PX) return;
      last = next;
      setContainerWidth(next);
      patchDiag({ containerWidth: next });
    }
    measure(card.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    ro.observe(card);
    let pollCount = 0;
    function poll() {
      if (cancelled || pollCount >= 15) return;
      pollCount++;
      measure(card.clientWidth);
      setTimeout(poll, 200);
    }
    setTimeout(poll, 200);
    return () => { cancelled = true; ro.disconnect(); };
  }, [patchDiag]);

  // ── Render the current page directly onto the one visible canvas ────
  useEffect(() => {
    if (containerWidth == null || containerWidth <= 0) return;
    const width = containerWidth;

    let cancelled = false;
    const id = ++renderIdRef.current;
    const isCancelled = () => cancelled || renderIdRef.current !== id;

    // Hide whatever was on screen for the PREVIOUS page immediately — the
    // canvas only becomes visible again once THIS page has actually
    // finished rendering, so a rapid Next/Previous sequence can never show
    // a page's pixels under the wrong page number.
    setVisible(false);
    setFailed(false);
    // Reset the diagnostic timeline for this new page/book/retry run —
    // per-stage timestamps and any prior error are stale once a new run
    // starts. containerWidth/dpr are carried over since they're still
    // accurate. Elapsed-since-mount is NOT reset (mountedAtRef is fixed
    // at true component mount, on purpose).
    setDiag((prev) => ({
      ...initialDiagnostics("measuring-container"),
      containerWidth: prev.containerWidth,
      dpr: prev.dpr,
    }));

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const clearRenderTimeout = () => {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    };

    function attempt(attemptNumber: number) {
      patchDiag({ attemptNumber });
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        if (isCancelled()) return;
        patchDiag({ stage: "timed-out", timeoutFired: true });
        if (attemptNumber < RENDER_MAX_ATTEMPTS) {
          id === renderIdRef.current && attempt(attemptNumber + 1);
        } else {
          setFailed(true);
          patchDiag({ stage: "failed" });
        }
      }, RENDER_TIMEOUT_MS);

      (async () => {
        patchDiag({ stage: "loading-document", docLoadStartedAt: performance.now() });
        const pdf = await getPdfDocument();
        if (isCancelled()) return;
        patchDiag({ stage: "document-loaded", docLoadCompletedAt: performance.now() });
        if (safePage > (pdf.numPages || safePage)) return;

        patchDiag({ stage: "loading-page", pageLoadStartedAt: performance.now() });
        const page = await pdf.getPage(safePage);
        if (isCancelled()) return;
        patchDiag({ stage: "page-loaded", pageLoadCompletedAt: performance.now() });

        const nativeVp = page.getViewport({ scale: 1 });
        const displayScale = Math.max(0.1, Math.min(width / nativeVp.width, 4));
        const dpr = Math.min(typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1, DPR_CAP);
        const renderScale = Math.min(displayScale * dpr, MAX_RENDER_SCALE);
        const renderVp = page.getViewport({ scale: renderScale });
        patchDiag({
          nativeVpW: Math.round(nativeVp.width), nativeVpH: Math.round(nativeVp.height),
          displayScale: Number(displayScale.toFixed(3)), renderScale: Number(renderScale.toFixed(3)),
        });

        // canvasRef is normally already attached by the time this runs —
        // the <canvas> is unconditionally in the tree whenever `!failed`,
        // and refs commit before effects run. It can still be transiently
        // null for a frame or two right after a commit that flips `failed`
        // back to false (the DOM node is brand new). Give it a bounded
        // wait rather than failing the whole attempt over a one-tick gap —
        // same reasoning as PdfBookSpread's own `if (!canvasRef.current)
        // return` guard for this exact class of race. setTimeout (not
        // requestAnimationFrame) so this still progresses in a
        // backgrounded/throttled tab, where rAF can be suspended entirely.
        let canvas = canvasRef.current;
        for (let i = 0; i < 10 && !canvas && !isCancelled(); i++) {
          await new Promise((resolve) => setTimeout(resolve, 16));
          canvas = canvasRef.current;
        }
        if (isCancelled()) return;
        if (!canvas) {
          patchDiag({ canvasMounted: false });
          return; // still not there — let the outer timeout's retry/failure path handle it, same as an ordinary stall
        }
        patchDiag({ stage: "canvas-ready", canvasMounted: true });
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("mobile-pdf-no-2d-context");

        // Cancel any still-in-flight render from a superseded attempt
        // before touching the shared canvas — pdf.js's own supported
        // cancellation API, so at most one render task is ever painting
        // this canvas at a time. This is what makes rendering DIRECTLY
        // onto the one visible canvas (rather than an offscreen buffer,
        // like the desktop path uses) safe under rapid navigation.
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* already settled */ }
          renderTaskRef.current = null;
        }

        canvas.width = Math.max(1, Math.floor(renderVp.width));
        canvas.height = Math.max(1, Math.floor(renderVp.height));
        canvas.style.width = Math.floor(displayScale * nativeVp.width) + "px";
        canvas.style.height = Math.floor(displayScale * nativeVp.height) + "px";
        patchDiag({ canvasW: canvas.width, canvasH: canvas.height });

        patchDiag({ stage: "render-started", renderStartedAt: performance.now() });
        const task = page.render({ canvasContext: ctx, viewport: renderVp });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current === task) renderTaskRef.current = null;
        if (isCancelled()) return;
        patchDiag({ stage: "render-completed", renderCompletedAt: performance.now() });

        clearRenderTimeout();
        setVisible(true);
        patchDiag({ stage: "visible" });

        // Best-effort, non-blocking — never delays the canvas becoming
        // visible above, and a failure here never surfaces as a render
        // failure (AI Companion already handles missing/weak page text).
        page.getTextContent()
          .then((tc: any) => {
            if (isCancelled()) return;
            const text = ((tc?.items ?? []) as any[])
              .map((item: any) => item.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            onTextExtracted?.({ [safePage]: text });
          })
          .catch(() => { /* best-effort only */ });
      })().catch((err) => {
        if (isCancelled() || isCancelledError(err)) return;
        clearRenderTimeout();
        console.error("Mobile PDF render error:", err);
        // Never swallowed — the exact name/message always land in the
        // on-screen diagnostic card, not just the console.
        patchDiag({
          errorName: err instanceof Error ? err.name : Object.prototype.toString.call(err),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        if (attemptNumber < RENDER_MAX_ATTEMPTS) {
          id === renderIdRef.current && attempt(attemptNumber + 1);
        } else {
          setFailed(true);
          patchDiag({ stage: "failed" });
        }
      });
    }

    attempt(1);

    return () => {
      cancelled = true;
      clearRenderTimeout();
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* already settled */ }
        renderTaskRef.current = null;
      }
    };
  }, [pdfPath, safePage, containerWidth, retryToken, getPdfDocument, onTextExtracted, patchDiag]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  const zoomTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`;

  const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - mountedAtRef.current);

  return (
    <section className="flex h-full flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-3 py-3">
      <main className="relative mx-auto flex w-full max-w-[720px] flex-1 min-h-0 items-center justify-center">
        <div
          ref={cardRef}
          className="relative z-10 flex h-full w-full items-center justify-center rounded-[1.75rem] border border-amber-200 bg-[#fffaf0] p-2 shadow-[0_20px_50px_rgba(75,45,12,0.25)]"
          style={{ overflow: zoom > 100 ? "auto" : "hidden" }}
        >
          {failed ? (
            <div className="flex max-w-[260px] flex-col items-center gap-3 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">⚠️</div>
              <p className="text-sm font-bold text-slate-600">{t.premiumReaderPageRenderFailed}</p>
              <button
                type="button"
                onClick={retry}
                className="ndl-press rounded-full bg-orange-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-orange-700"
              >
                🔄 {t.commonRetry}
              </button>
            </div>
          ) : (
            <div style={{ transform: zoomTransform, transformOrigin: "center center", position: "relative" }}>
              <div className="relative flex items-center justify-center rounded-2xl bg-white p-1">
                {!visible && (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <div className="ndl-skeleton h-[380px] w-[260px] rounded-2xl shadow-lg" />
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                      {t.premiumReaderLoadingPage}
                    </div>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  data-pdf-page={safePage}
                  style={{ display: visible ? "block" : "none", maxWidth: "100%", borderRadius: 8 }}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── TEMPORARY: on-screen diagnostic card ─────────────────────────
          Only ever mounted below 640px (this whole component only renders
          there), so this never appears for desktop/tablet users. Selectable
          text so it can be copied, plus it's screenshot-friendly. */}
      <div className="mx-auto mt-2 w-full max-w-[720px] flex-shrink-0 select-text rounded-2xl bg-slate-950/95 px-3 py-2 text-[10px] leading-snug text-white shadow-lg">
        <p className="mb-1 text-[11px] font-black text-amber-300">Mobile PDF Diagnostic — temporary test build</p>
        <DiagnosticRow label="stage" value={diag.stage} />
        <DiagnosticRow label="bookId" value={bookId} />
        <DiagnosticRow label="requested page" value={pageNumber} />
        <DiagnosticRow label="attempt" value={`${diag.attemptNumber} / ${RENDER_MAX_ATTEMPTS}`} />
        <DiagnosticRow label="elapsed ms (since mount)" value={elapsedMs} />
        <DiagnosticRow label="container width" value={diag.containerWidth} />
        <DiagnosticRow label="devicePixelRatio" value={diag.dpr} />
        <DiagnosticRow label="pdf url" value={pdfPath} />
        <DiagnosticRow
          label="document load"
          value={
            diag.docLoadCompletedAt != null ? `done (${Math.round(diag.docLoadCompletedAt - (diag.docLoadStartedAt ?? diag.docLoadCompletedAt))}ms)`
            : diag.docLoadStartedAt != null ? "started…"
            : "not started"
          }
        />
        <DiagnosticRow
          label="page load"
          value={
            diag.pageLoadCompletedAt != null ? `done (${Math.round(diag.pageLoadCompletedAt - (diag.pageLoadStartedAt ?? diag.pageLoadCompletedAt))}ms)`
            : diag.pageLoadStartedAt != null ? "started…"
            : "not started"
          }
        />
        <DiagnosticRow label="native viewport" value={diag.nativeVpW != null ? `${diag.nativeVpW} × ${diag.nativeVpH}` : null} />
        <DiagnosticRow label="display scale" value={diag.displayScale} />
        <DiagnosticRow label="render scale" value={diag.renderScale} />
        <DiagnosticRow label="canvas backing dims" value={diag.canvasW != null ? `${diag.canvasW} × ${diag.canvasH}` : null} />
        <DiagnosticRow label="canvas mounted" value={diag.canvasMounted == null ? null : diag.canvasMounted ? "yes" : "no"} />
        <DiagnosticRow label="render started" value={diag.renderStartedAt != null ? "yes" : "no"} />
        <DiagnosticRow label="render completed" value={diag.renderCompletedAt != null ? "yes" : "no"} />
        <DiagnosticRow label="timeout fired" value={diag.timeoutFired ? "yes" : "no"} />
        <DiagnosticRow label="error name" value={diag.errorName} />
        <DiagnosticRow label="error message" value={diag.errorMessage} />
      </div>
    </section>
  );
}
