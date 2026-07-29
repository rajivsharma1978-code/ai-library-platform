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
// ── P0 fix: legacy pdf.js build ───────────────────────────────────────
// Real-device testing (iPhone Safari) surfaced a second issue beyond the
// architecture above: `TypeError: getOrInsertComputed is not a function`,
// thrown by pdfjs-dist's MODERN "generic" build, which assumes a JS engine
// feature that iPhone's WebKit doesn't have. The `getPdfDocument` prop
// this component receives now resolves to a PDFDocumentProxy created by
// pdfjs-dist's LEGACY build instead (see PremiumReaderPreviewContent's
// getSharedMobilePdfDocument) — nothing in THIS file changes for that fix,
// since PDFDocumentProxy/PDFPageProxy's public API (getPage, getViewport,
// render, getTextContent) is identical either way; only which build
// produced the object differs, entirely upstream of here.
import { useCallback, useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export type MobilePdfPageProps = {
  pdfPath: string;
  pageNumber: number;
  totalPages: number;
  zoom?: number;
  pan?: { x: number; y: number };
  isPanning?: boolean;
  /** Resolves to an already-cached pdf.js document (keyed by book+URL) —
   *  see PremiumReaderPreviewContent's getSharedMobilePdfDocument
   *  (pdfjs-dist's LEGACY build — see the file-top "P0 fix" comment for
   *  why this must NOT be the same modern document AI text extraction
   *  uses). */
  getPdfDocument: () => Promise<any>;
  /** Same shape as PdfBookSpread's onTextExtracted — plain pdf.js
   *  page.getTextContent() output, fired AFTER the canvas is visible and
   *  never blocking it. No text-selection layer is built from this; it
   *  only feeds AI Companion / Read Aloud's existing pageTexts state. */
  onTextExtracted?: (texts: Record<number, string>) => void;
  /** Premium landscape redesign: shrinks the decorative outer frame
   *  (section padding, card border/radius/shadow) so the book itself
   *  claims nearly the full screen — visual-only, touches no rendering
   *  logic, no measurement math, no pdf.js calls. Card's own internal
   *  padding (CARD_PADDING_PX, tied to the width/height fit math below)
   *  is deliberately left untouched by this flag. */
  landscape?: boolean;
  /** Real-device follow-up: shows a small on-canvas panel with live
   *  render stats when ?renderDebug=1 is in the URL. Never rendered
   *  otherwise. */
  renderDebug?: boolean;
};

// Matches PdfBookSpread's own render-timeout contract (see that file's
// "Render timeout / retry safety net" comment) so mobile gets an
// equivalent, not weaker, safety net: bounded per attempt, one automatic
// retry, then a visible, user-actionable failure state — never a silent
// indefinite spinner.
const RENDER_TIMEOUT_MS = 12000;
const RENDER_MAX_ATTEMPTS = 2;

// ── Real-device follow-up: sharp rendering ─────────────────────────────
// The old approach (a flat DPR_CAP=1.5 combined with a flat
// MAX_RENDER_SCALE=3 ceiling on displayScale*dpr) capped resolution well
// below what most real phones can actually display, which is exactly why
// text looked hazy even at a plain 100% landscape fit — a 700×500 CSS-px
// page on a 3x-DPR iPhone was being rendered at a 1.5x backing store
// (1050×750) instead of a native-sharp one, then whatever zoom was
// applied on top of THAT via a CSS transform (never a re-render), so
// zooming just magnified the already-soft bitmap.
//
// Replaced with a genuine safety BUDGET instead of a flat multiplier:
// use the real devicePixelRatio whenever the resulting backing canvas
// still fits comfortably under both a total-pixel-count ceiling and a
// per-axis ceiling (iOS Safari's historical hard per-canvas limit is
// 16,777,216 px / 4096px per side — MAX_CANVAS_PIXELS stays well under
// that for headroom across older/weaker Android devices too), and only
// steps DPR down when the actual target size would exceed it — e.g. a
// small portrait phone in normal use keeps full native DPR (sharp), a
// heavily zoomed-in canvas on an older device gracefully loses some
// sharpness rather than failing to allocate at all.
const MAX_CANVAS_PIXELS = 6_000_000;
const MAX_CANVAS_DIMENSION_PX = 4096;

function computeSafeDpr(cssWidth: number, cssHeight: number, rawDpr: number): number {
  if (cssWidth <= 0 || cssHeight <= 0) return 1;
  let dpr = Math.max(1, rawDpr);
  const fits = (d: number) =>
    cssWidth * d <= MAX_CANVAS_DIMENSION_PX &&
    cssHeight * d <= MAX_CANVAS_DIMENSION_PX &&
    cssWidth * d * (cssHeight * d) <= MAX_CANVAS_PIXELS;
  while (dpr > 1 && !fits(dpr)) dpr = Math.round((dpr - 0.25) * 100) / 100;
  return Math.max(1, dpr);
}

// Zoom changes fire on every pinch pointermove tick (see
// PremiumReaderPreviewContent's pinch handler) — re-rendering the PDF at
// full resolution on every one of those would be both wasteful and
// exactly the kind of render-loop the validation checklist calls out.
// Only the SETTLED zoom (no change for this long) triggers a real
// pdf.js re-render; every tick before that just nudges a CSS scale
// factor on the existing bitmap (see zoomTransform below) — "temporary
// CSS scaling during active pinch, sharp re-render once it ends."
const ZOOM_SETTLE_DEBOUNCE_MS = 350;

// The card's own padding (Tailwind p-2 → 0.5rem = 8px per side) — kept as
// a named constant, subtracted from the measured card width, so the
// canvas's target CSS width is the actual available content box, not the
// padded box (which would overflow it).
const CARD_PADDING_PX = 16;
// Landscape strips the card down to zero padding (see cardCls below) —
// its own measurement offset drops to match, so the fit calculation
// still reflects the real available box instead of under-measuring it.
const CARD_PADDING_PX_LANDSCAPE = 0;

// Resize/measurement noise smaller than this is ignored — avoids a
// re-render loop from sub-pixel layout jitter.
const WIDTH_CHANGE_THRESHOLD_PX = 4;

function isCancelledError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as any).name === "RenderingCancelledException";
}

export default function MobilePdfPage({
  pdfPath, pageNumber, totalPages, zoom = 100, pan = { x: 0, y: 0 }, isPanning = false,
  getPdfDocument, onTextExtracted, landscape = false, renderDebug = false,
}: MobilePdfPageProps) {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const renderIdRef = useRef(0);
  const lastRenderedPageKeyRef = useRef<string | null>(null);

  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  // RC1 P2: tracked alongside width so the render effect below can fit
  // the page to whichever dimension is actually the tighter constraint
  // (see "Render the current page" effect) — needed once landscape mode
  // widens the card beyond its old fixed max-width (see the JSX below),
  // where a tall portrait-oriented page would otherwise overflow the
  // short landscape viewport if sized by width alone.
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  // Real-device follow-up: true only while a SAME-page re-render is in
  // flight (zoom settled, container resized, DPR changed, …) — kept
  // separate from `visible`/skeleton so a resharpen never blanks the
  // page back to the loading skeleton; see the render effect below.
  const [resharpening, setResharpening] = useState(false);
  // Last render's stats, for the ?renderDebug=1 panel only.
  const [debugStats, setDebugStats] = useState<{
    cssW: number; cssH: number; backingW: number; backingH: number;
    dpr: number; effectiveDpr: number; vpScale: number; durationMs: number;
    temporary: boolean;
  } | null>(null);

  const safePage = Math.max(1, Math.min(Math.floor(pageNumber) || 1, Math.max(1, Math.floor(totalPages) || 1)));

  // ── Debounced zoom: pinch/± updates `zoom` on every tick, but only a
  // SETTLED zoom (unchanged for ZOOM_SETTLE_DEBOUNCE_MS) should trigger a
  // real pdf.js re-render — see the file-top comment. Until it settles,
  // the wrapper's CSS transform (zoomTransform below) just scales the
  // existing bitmap by the live/settled ratio, which is the "temporary
  // CSS scaling during active pinch" the spec asks for.
  const [debouncedZoom, setDebouncedZoom] = useState(zoom);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedZoom(zoom), ZOOM_SETTLE_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [zoom]);

  const cardPaddingPx = landscape ? CARD_PADDING_PX_LANDSCAPE : CARD_PADDING_PX;

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
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const card = cardEl;
    let lastW = 0, lastH = 0;
    let cancelled = false;
    function measure(width: number, height: number) {
      const nextW = Math.max(0, width - cardPaddingPx * 2);
      const nextH = Math.max(0, height - cardPaddingPx * 2);
      if (Math.abs(nextW - lastW) >= WIDTH_CHANGE_THRESHOLD_PX) { lastW = nextW; setContainerWidth(nextW); }
      if (Math.abs(nextH - lastH) >= WIDTH_CHANGE_THRESHOLD_PX) { lastH = nextH; setContainerHeight(nextH); }
    }
    measure(card.clientWidth, card.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(card);
    let pollCount = 0;
    function poll() {
      if (cancelled || pollCount >= 15) return;
      pollCount++;
      measure(card.clientWidth, card.clientHeight);
      setTimeout(poll, 200);
    }
    setTimeout(poll, 200);
    return () => { cancelled = true; ro.disconnect(); };
  }, [cardPaddingPx]);

  // ── Render the current page directly onto the one visible canvas ────
  useEffect(() => {
    if (containerWidth == null || containerWidth <= 0) return;
    const width = containerWidth;
    const height = containerHeight;

    let cancelled = false;
    const id = ++renderIdRef.current;
    const isCancelled = () => cancelled || renderIdRef.current !== id;
    const renderStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Same page (and same render "identity" — pdfPath/retryToken) as last
    // time means this run was triggered by a container resize, a zoom
    // settling, or a DPR change — keep the current bitmap on screen (just
    // flag `resharpening`) instead of blanking back to the skeleton,
    // which the old unconditional setVisible(false) did on every one of
    // these triggers, not just real page turns.
    const pageKey = `${pdfPath}:${safePage}:${retryToken}`;
    const isFreshPage = lastRenderedPageKeyRef.current !== pageKey;
    lastRenderedPageKeyRef.current = pageKey;
    if (isFreshPage) {
      // Hide whatever was on screen for the PREVIOUS page immediately —
      // the canvas only becomes visible again once THIS page has
      // actually finished rendering, so a rapid Next/Previous sequence
      // can never show a page's pixels under the wrong page number.
      setVisible(false);
    } else {
      setResharpening(true);
    }
    setFailed(false);

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const clearRenderTimeout = () => {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    };

    function attempt(attemptNumber: number) {
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        if (isCancelled()) return;
        if (attemptNumber < RENDER_MAX_ATTEMPTS) {
          id === renderIdRef.current && attempt(attemptNumber + 1);
        } else {
          setFailed(true);
          setResharpening(false);
        }
      }, RENDER_TIMEOUT_MS);

      (async () => {
        const pdf = await getPdfDocument();
        if (isCancelled()) return;
        if (safePage > (pdf.numPages || safePage)) return;

        const page = await pdf.getPage(safePage);
        if (isCancelled()) return;

        const nativeVp = page.getViewport({ scale: 1 });
        // RC1 P2: contain-fit against BOTH dimensions, not width alone —
        // width-only was fine while the card's max-width kept it
        // narrower than the phone was tall (portrait), but landscape
        // mode now lets the card grow much wider than the phone is
        // tall, where a portrait-oriented page sized by width alone
        // would render taller than the available height and get
        // clipped by the card's `overflow:hidden`. Falls back to width-
        // only if height hasn't measured yet (never blocks first paint).
        const scaleForWidth = width / nativeVp.width;
        const scaleForHeight = height != null && height > 0 ? height / nativeVp.height : scaleForWidth;
        const baseFitScale = Math.max(0.1, Math.min(scaleForWidth, scaleForHeight, 4));
        // Real-device follow-up: the SETTLED zoom is baked into the
        // render itself now (not applied afterward via CSS scale — see
        // zoomTransform below), so a "100%" page and a "180%" page both
        // get a genuinely sharp pdf.js render, not the same bitmap
        // stretched further.
        const displayScale = baseFitScale * (debouncedZoom / 100);
        const cssW = displayScale * nativeVp.width;
        const cssH = displayScale * nativeVp.height;
        const rawDpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
        const effectiveDpr = computeSafeDpr(cssW, cssH, rawDpr);
        const renderScale = displayScale * effectiveDpr;
        const renderVp = page.getViewport({ scale: renderScale });

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
        if (!canvas) return; // still not there — let the outer timeout's retry/failure path handle it, same as an ordinary stall
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

        // Backing pixel dimensions (what actually gets painted) vs CSS
        // display dimensions (what the layout/box model sees) — kept
        // deliberately separate, per the sharp-rendering requirement.
        // renderVp already has effectiveDpr baked into its scale, so
        // canvas.width/height are the real backing store; canvas.style.*
        // is the unscaled CSS box the browser lays out and the wrapper's
        // CSS transform (zoomTransform) further scales during live pinch.
        canvas.width = Math.max(1, Math.floor(renderVp.width));
        canvas.height = Math.max(1, Math.floor(renderVp.height));
        canvas.style.width = Math.floor(cssW) + "px";
        canvas.style.height = Math.floor(cssH) + "px";

        const task = page.render({ canvasContext: ctx, viewport: renderVp });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current === task) renderTaskRef.current = null;
        if (isCancelled()) return;

        clearRenderTimeout();
        setVisible(true);
        setResharpening(false);
        if (renderDebug) {
          setDebugStats({
            cssW: Math.floor(cssW), cssH: Math.floor(cssH),
            backingW: canvas.width, backingH: canvas.height,
            dpr: rawDpr, effectiveDpr, vpScale: renderScale,
            durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - renderStartedAt),
            temporary: false,
          });
        }

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
        if (attemptNumber < RENDER_MAX_ATTEMPTS) {
          id === renderIdRef.current && attempt(attemptNumber + 1);
        } else {
          setFailed(true);
          setResharpening(false);
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
  }, [pdfPath, safePage, containerWidth, containerHeight, debouncedZoom, retryToken, getPdfDocument, onTextExtracted, renderDebug]);

  // Real-device follow-up: devicePixelRatio changes are rare on mobile
  // (essentially only "drag this browser window to another display",
  // which doesn't happen on a phone) but the spec explicitly calls it
  // out — a self-reattaching matchMedia listener is the standard way to
  // detect it, since a fired MediaQueryList's query no longer matches
  // the NEW ratio. Reuses the existing retry mechanism (same as a manual
  // Retry tap) rather than adding a second render path.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let disposed = false;
    let mql: MediaQueryList | null = null;
    function onChange() {
      if (mql) mql.removeEventListener("change", onChange);
      setRetryToken((n) => n + 1);
      attach();
    }
    function attach() {
      if (disposed) return;
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onChange);
    }
    attach();
    return () => { disposed = true; if (mql) mql.removeEventListener("change", onChange); };
  }, []);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  // Residual live-pinch scaling ONLY — once debouncedZoom catches up to
  // zoom (render effect above has baked it into a fresh sharp bitmap),
  // this ratio is exactly 1 and the canvas is shown at its own native
  // CSS size, not stretched. See the ZOOM_SETTLE_DEBOUNCE_MS comment.
  const liveScaleRatio = debouncedZoom > 0 ? zoom / debouncedZoom : 1;
  const zoomTransform = `translate(${pan.x}px, ${pan.y}px) scale(${liveScaleRatio})`;

  // True immersive landscape: no card, no frame, no gutter — the page
  // background IS the only major visible surface (near-black, per spec,
  // so any natural letterboxing from an aspect-ratio mismatch reads as
  // intentional, not as a layout bug). Portrait's decorative parchment
  // frame is completely untouched below.
  const sectionCls = landscape
    ? "flex h-full flex-col bg-[#050403]"
    : "flex h-full flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-3 py-3";
  // Landscape's notch/home-indicator sit on the SIDE, not top/bottom — the
  // floating header/dock (parent component) already handle top/bottom
  // safe areas; this handles left/right so the page itself never sits
  // under a physical notch cutout.
  const sectionStyle: React.CSSProperties | undefined = landscape
    ? { paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }
    : undefined;
  const cardCls = landscape
    ? "relative z-10 flex h-full w-full items-center justify-center"
    : "relative z-10 flex h-full w-full items-center justify-center rounded-[1.75rem] border border-amber-200 bg-[#fffaf0] p-2 shadow-[0_20px_50px_rgba(75,45,12,0.25)]";
  const cardStyle: React.CSSProperties = landscape
    ? { overflow: zoom > 100 ? "auto" : "hidden", touchAction: "none" }
    : { overflow: zoom > 100 ? "auto" : "hidden", touchAction: "none" };

  return (
    <section className={sectionCls} style={sectionStyle}>
      {/* No max-width in landscape — "no max-width, page should touch or
          nearly touch the limiting screen edges." Portrait's 1400px cap
          (a portrait-era number, see history below) is untouched. */}
      <main className={landscape ? "relative flex w-full flex-1 min-h-0 items-center justify-center" : "relative mx-auto flex w-full max-w-[1400px] flex-1 min-h-0 items-center justify-center"}>
        <div
          ref={cardRef}
          className={cardCls}
          // Real-device gesture fix: panning at zoom>100 is fully owned by
          // the parent reader surface's pointer-event handlers (CSS
          // transform, never native scrollLeft/Top) — `overflow:auto`
          // still helps non-touch fallbacks (e.g. a trackpad), but without
          // its own `touch-action: none` this div's default touch-action
          // (`auto`) let the browser's native scroll compete with our
          // custom pinch/pan for the same touch on real iOS Safari.
          style={cardStyle}
        >
          {failed ? (
            <div className="flex max-w-[260px] flex-col items-center gap-3 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">⚠️</div>
              <p className={landscape ? "text-sm font-bold text-white/70" : "text-sm font-bold text-slate-600"}>{t.premiumReaderPageRenderFailed}</p>
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
              {/* Real-device follow-up: an unobtrusive corner spinner
                  while a same-page resharpen is in flight — never the
                  full skeleton (that's page-turns only, see the render
                  effect's isFreshPage branch). */}
              {resharpening && (
                <div className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/45">
                  <div className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                </div>
              )}
              <div className={landscape ? "relative flex items-center justify-center" : "relative flex items-center justify-center rounded-2xl bg-white p-1"}>
                {!visible && (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <div className={landscape ? "h-[280px] w-[200px] animate-pulse rounded-lg bg-white/10" : "ndl-skeleton h-[380px] w-[260px] rounded-2xl shadow-lg"} />
                    <div className={landscape ? "flex items-center gap-2 text-xs font-bold text-white/50" : "flex items-center gap-2 text-xs font-bold text-slate-500"}>
                      <div className={landscape ? "h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" : "h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600"} />
                      {t.premiumReaderLoadingPage}
                    </div>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  data-pdf-page={safePage}
                  style={{ display: visible ? "block" : "none", maxWidth: "100%", borderRadius: landscape ? 0 : 8 }}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Temporary real-device rendering diagnostics — ?renderDebug=1
          only, never otherwise. pointer-events:none so it can never
          itself intercept a gesture. */}
      {renderDebug && (
        <div
          style={{
            position: "fixed", bottom: 8, left: 8, zIndex: 99999, pointerEvents: "none",
            background: "rgba(0,0,0,0.82)", color: "#0f0", fontFamily: "monospace",
            fontSize: 11, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8,
            maxWidth: 280, whiteSpace: "pre",
          }}
        >
{`renderDebug
visualVP:   ${typeof window !== "undefined" && window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}` : "n/a"}
readerRoot: ${cardRef.current ? `${Math.round(cardRef.current.clientWidth)}x${Math.round(cardRef.current.clientHeight)}` : "n/a"}
cssCanvas:  ${debugStats ? `${debugStats.cssW}x${debugStats.cssH}` : "n/a"}
backing:    ${debugStats ? `${debugStats.backingW}x${debugStats.backingH}` : "n/a"}
dpr:        ${debugStats ? debugStats.dpr.toFixed(2) : "n/a"}
effDpr:     ${debugStats ? debugStats.effectiveDpr.toFixed(2) : "n/a"}
vpScale:    ${debugStats ? debugStats.vpScale.toFixed(3) : "n/a"}
userZoom:   ${zoom}% (settled ${debouncedZoom}%)
fullscreen: ${typeof document !== "undefined" ? !!document.fullscreenElement : "n/a"}
standalone: ${typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(display-mode: standalone)").matches : "n/a"}
lastRender: ${debugStats ? debugStats.durationMs + "ms" : "n/a"}
pixels:     ${debugStats ? (debugStats.backingW * debugStats.backingH).toLocaleString() : "n/a"}
mode:       ${resharpening ? "resharpening…" : liveScaleRatio !== 1 ? "temporary CSS-scaled" : "fresh PDF render"}`}
        </div>
      )}
    </section>
  );
}
