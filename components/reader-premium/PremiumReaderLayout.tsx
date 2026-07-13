"use client";

import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReaderNav from "./ReaderNav";

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
  { center, aiPanel, aiPanelWidthPx, aiPanelOverlay = false }, ref
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exitControlVisible, setExitControlVisible] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }

  useImperativeHandle(ref, () => ({ toggleFullscreen }), []);

  return (
    <div
      ref={mainRef}
      className="h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] text-slate-950"
    >
      <div className="flex h-full">
        <ReaderNav forceCollapsed={isFullscreen} />

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

      {/* Mobile: AI Companion as a full-height overlay instead of a
          permanent column, so the book keeps the full viewport width
          until the panel is explicitly opened. */}
      {aiPanelOverlay && (
        <div data-a11y-focus-hide className="ndl-fade-in-scale fixed inset-0 z-50 bg-white">
          {aiPanel}
        </div>
      )}

      {/* Exit Fullscreen — small floating overlay, fixed to the viewport
          corner, outside the flex row entirely so it never disturbs any
          toolbar's own layout. Auto-hides on idle, reappears on move. */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          title="Exit fullscreen (Esc)"
          aria-label="Exit fullscreen"
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
