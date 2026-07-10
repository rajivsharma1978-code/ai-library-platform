"use client";

// ── Reading Ruler & Reading Mask (Phase B3) ─────────────────────────────
// Both are viewport-fixed overlays, positioned independently of whatever
// page content sits underneath — that's deliberate: it means "works with
// scrolling and page turning" for free (a fixed-position element never
// needs to know the scroll offset or which PDF page is showing), without
// touching a single line of any reader's own rendering or page-turn
// logic. Rendered by AccessibilityToolbar, so both appear wherever the
// toolbar does — no per-page wiring, no second toolbar.

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/useLanguage";
import { UI_TEXT, type Language } from "@/lib/i18n";
import type { A11ySettings } from "@/lib/accessibilitySettings";

const RULER_STEP = 24; // px per arrow-key press

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(245,158,11,${alpha})`;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ReadingRuler({ settings }: { settings: A11ySettings }) {
  const { language } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const t = UI_TEXT[(mounted ? language : "en") as Language];
  useEffect(() => setMounted(true), []);

  const [y, setY] = useState<number | null>(null);
  const draggingRef = useRef(false);

  // Center it the first time it's switched on; keep its position across
  // toggles/re-renders after that instead of re-centering every render.
  useEffect(() => {
    if (settings.rulerEnabled && y === null && typeof window !== "undefined") {
      setY(window.innerHeight / 2);
    }
  }, [settings.rulerEnabled, y]);

  useEffect(() => {
    function clamp(value: number) {
      return Math.min(window.innerHeight - settings.rulerThickness, Math.max(0, value));
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      setY(clamp(e.clientY - settings.rulerThickness / 2));
    }
    function onUp() { draggingRef.current = false; }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [settings.rulerThickness]);

  if (!settings.rulerEnabled || y === null) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") { e.preventDefault(); setY(v => Math.max(0, (v ?? 0) - RULER_STEP)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setY(v => Math.min(window.innerHeight - settings.rulerThickness, (v ?? 0) + RULER_STEP)); }
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={t.rulerAriaLabel}
      aria-orientation="horizontal"
      aria-valuenow={Math.round(y)}
      aria-valuemin={0}
      aria-valuemax={typeof window !== "undefined" ? window.innerHeight - settings.rulerThickness : 0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { draggingRef.current = true; (e.target as HTMLElement).focus(); }}
      data-a11y-no-invert
      className="fixed left-0 right-0 z-[9997] cursor-ns-resize touch-none rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.15)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{
        top: y,
        height: settings.rulerThickness,
        background: hexToRgba(settings.rulerColor, 0.35),
        borderTop: `2px solid ${settings.rulerColor}`,
        borderBottom: `2px solid ${settings.rulerColor}`,
      }}
    />
  );
}

export function ReadingMask({ settings }: { settings: A11ySettings }) {
  const { language } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const t = UI_TEXT[(mounted ? language : "en") as Language];
  useEffect(() => setMounted(true), []);

  const [y, setY] = useState<number | null>(null);

  useEffect(() => {
    if (settings.maskEnabled && y === null && typeof window !== "undefined") {
      setY(window.innerHeight / 2 - settings.maskHeight / 2);
    }
  }, [settings.maskEnabled, y, settings.maskHeight]);

  useEffect(() => {
    if (!settings.maskEnabled) return;
    function clamp(value: number) {
      return Math.min(window.innerHeight - settings.maskHeight, Math.max(0, value));
    }
    function reposition(clientY: number) {
      setY(clamp(clientY - settings.maskHeight / 2));
    }
    function onMouseMove(e: MouseEvent) { reposition(e.clientY); }
    function onTouchMove(e: TouchEvent) {
      const t0 = e.touches[0];
      if (t0) reposition(t0.clientY);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [settings.maskEnabled, settings.maskHeight]);

  if (!settings.maskEnabled || y === null) return null;

  const alpha = settings.maskOpacity / 100;
  const shared: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    background: `rgba(0,0,0,${alpha})`,
    pointerEvents: "none",
    zIndex: 9996,
    transition: "top 90ms ease-out, height 90ms ease-out",
  };

  return (
    <div aria-hidden data-a11y-no-invert title={t.maskAriaLabel}>
      <div style={{ ...shared, top: 0, height: y }} />
      <div style={{ ...shared, top: y + settings.maskHeight, bottom: 0, height: "auto" }} />
    </div>
  );
}
