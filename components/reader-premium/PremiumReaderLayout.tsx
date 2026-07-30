"use client";

import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReaderNav from "./ReaderNav";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type PremiumReaderLayoutProps = {
  /** The whole central reading zone (toolbar + book + bottom bar) — the
   *  caller also includes its own fixed-position floating bottom bar
   *  here when in fullscreen, so this layout never needs to know about
   *  reader-specific handlers (Read Page, Highlight, zoom, …). */
  center: ReactNode;
  /** Fully-rendered AI Companion — the caller decides compact vs.
   *  expanded content and passes the matching width below. */
  aiPanel: ReactNode;
  aiPanelWidthPx: number;
  /** Mobile (spec: "AI Companion becomes bottom sheet or full-height
   *  overlay"): render the AI panel as a full-screen fixed overlay
   *  instead of a permanent flex column, so the book keeps the full
   *  viewport width whenever the panel isn't explicitly open. */
  aiPanelOverlay?: boolean;
  /** Phase D1 (mobile UX redesign): on mobile (<640px) the permanent left
   *  sidebar is removed entirely rather than collapsed, so the reading
   *  zone gets the full viewport width — ReaderNav itself is untouched,
   *  this just omits it from the tree. Desktop/tablet always pass false
   *  (or omit), so their layout is byte-for-byte unchanged. */
  hideNav?: boolean;
  /** Phase D3: lets the mobile-only AI/Study bottom sheet close on a
   *  backdrop tap, matching the Accessibility glass panel and the More
   *  sheet (both already close on backdrop tap). Only ever passed when
   *  aiPanelOverlay is true, i.e. never on desktop/tablet. */
  onCloseAiPanel?: () => void;
};

export type PremiumReaderLayoutHandle = { toggleFullscreen: () => void };

// How long the Exit Fullscreen control stays visible after the mouse
// last moved before it fades out — a small corner overlay, not a
// reserved strip, so it's out of the way almost all the time.
const EXIT_CONTROL_IDLE_MS = 2200;

/**
 * Three-zone Premium Reader shell (Phase C3): collapsible left nav,
 * spacious central reading area, AI Companion panel. Dedicated to the
 * Premium Reader only — components/reader/ReaderLayout.tsx (still used
 * by the separate /reader legacy route) is untouched, so this redesign
 * carries zero risk to that page.
 *
 * Plain flexbox rather than CSS Grid, deliberately: Focus Mode
 * (app/globals.css, html[data-a11y-focus="true"] [data-a11y-focus-hide])
 * already hides any element carrying data-a11y-focus-hide via
 * display:none — with flex children that's enough on its own for the
 * remaining flex-1 center column to reclaim the freed width, so this
 * layout needs no bespoke grid-column override the way the old
 * ReaderLayout's .ndl-reader-grid class did.
 */
const PremiumReaderLayout = forwardRef<PremiumReaderLayoutHandle, PremiumReaderLayoutProps>(function PremiumReaderLayout(
  { center, aiPanel, aiPanelWidthPx, aiPanelOverlay = false, hideNav = false, onCloseAiPanel }, ref
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exitControlVisible, setExitControlVisible] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  useEffect(() => {
    function handleChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    setExitControlVisible(true);
    function resetIdleTimer() {
      setExitControlVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setExitControlVisible(false), EXIT_CONTROL_IDLE_MS);
    }
    resetIdleTimer();
    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("touchstart", resetIdleTimer);
    return () => {
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("touchstart", resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFullscreen]);

  // Fullscreens document.documentElement (<html>), NOT mainRef. Reason:
  // the Fullscreen API's "top layer" only paints descendants of whichever
  // element is fullscreened — anything outside that subtree (even
  // position:fixed, high-z-index elements) stops being rendered/clickable
  // while fullscreen is active. FloatingControlsDock (Accessibility
  // button, Voice Assistant, Reading Ruler/Mask) renders via a React
  // portal into #ndl-fixed-portal, a div appended as a SIBLING of <body>
  // (see lib/fixedPortal.ts) — outside mainRef's subtree no matter where
  // in the React tree the component is mounted. Fullscreening mainRef
  // therefore made all of those floating controls disappear and stop
  // receiving clicks. Fullscreening <html> instead keeps mainRef AND the
  // portal root in the same fullscreen subtree, so every floating control
  // keeps working exactly as in normal mode.
  function toggleFullscreen() {
    // Real-device follow-up: requestFullscreen()/exitFullscreen() both
    // return Promises that REJECT (never throw) when the browser denies
    // the request — e.g. no user-activation window left, or the platform
    // doesn't support it at all. Neither call was awaited/caught before,
    // which is exactly the kind of unhandled-rejection the immersive-
    // landscape work was asked to eliminate. Swallowing it here is
    // correct either way: on failure the CSS fallback (bookAreaRef's own
    // fixed-inset-0 positioning in landscape) already covers the same
    // "reader root fills the screen" goal, so there's nothing further to
    // do or surface to the user.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { /* denied — CSS fallback already covers this */ });
    } else {
      document.exitFullscreen().catch(() => { /* already left fullscreen some other way */ });
    }
  }

  useImperativeHandle(ref, () => ({ toggleFullscreen }), []);

  return (
    <div
      ref={mainRef}
      // Phase D3.1 point 8: mobile (hideNav is only ever true below 640px)
      // uses h-dvh instead of h-screen so Safari's collapsing/expanding
      // address bar doesn't leave chrome stranded above or below the
      // real visible viewport. Desktop/tablet keep h-screen (100vh)
      // completely unchanged — hideNav is false there, always.
      className={`${hideNav ? "h-dvh" : "h-screen"} w-full overflow-hidden bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] text-slate-950`}
    >
      <div className="flex h-full">
        {!hideNav && <ReaderNav forceCollapsed={isFullscreen} />}

        <section className="relative h-full min-w-0 flex-1 overflow-hidden">
          {center}
        </section>

        {!aiPanelOverlay && (
          <aside
            data-a11y-focus-hide
            className="h-full flex-shrink-0 overflow-hidden border-l border-amber-200/70 bg-white transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: aiPanelWidthPx }}
          >
            {aiPanel}
          </aside>
        )}
      </div>

      {/* Mobile (Phase D2 "Reading First"): AI Companion / Study as a
          bottom sheet instead of a permanent column OR the old opaque
          full-screen cover — a dimmed-but-visible backdrop (not solid
          white) keeps the PDF in view behind it, and the sheet itself
          is capped below full height so a strip of the page always
          shows above it. This branch is exclusively mobile
          (aiPanelOverlay = isMobileViewport && !aiPanelCompact), so
          desktop/tablet — which always use the <aside> above — are
          completely unaffected by this styling change. */}
      {aiPanelOverlay && (
        <div data-a11y-focus-hide className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onCloseAiPanel}>
          <div className="ndl-fade-in-scale flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_-10px_60px_rgba(0,0,0,0.35)]" onClick={(e) => e.stopPropagation()}>
            {aiPanel}
          </div>
        </div>
      )}

      {/* Exit Fullscreen — small floating overlay, fixed to the viewport
          corner, outside the flex row entirely so it never disturbs any
          toolbar's own layout. Auto-hides on idle, reappears on move. */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          title={t.premiumReaderExitFullscreenEsc}
          aria-label={t.readerExitFullscreen}
          className="ndl-press fixed right-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 text-base text-white shadow-lg backdrop-blur-sm transition-opacity duration-300 hover:bg-slate-950"
          style={{
            opacity: exitControlVisible ? 1 : 0,
            pointerEvents: exitControlVisible ? "auto" : "none",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
});

export default PremiumReaderLayout;
