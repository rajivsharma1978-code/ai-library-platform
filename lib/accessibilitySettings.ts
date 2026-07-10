"use client";

// ── Shared Accessibility Settings ───────────────────────────────────────
// Single source of truth for the ndl_a11y_settings localStorage schema,
// used by AccessibilityToolbar (the panel UI), VoiceAssistant (voice
// accessibility commands), and the Reading Ruler/Mask overlays. All
// consumers read/write through useA11ySettings() so nobody drifts out of
// sync with anybody else's copy.
//
// Phase B3 extends the original 5-field schema (fontScale/highContrast/
// darkMode/readingMode/focusMode) with Reading Ruler, Reading Mask,
// Dyslexia Mode, and Visual Comfort fields. This is additive only: old
// stored settings merge against DEFAULT_A11Y_SETTINGS on load (see
// loadA11ySettings), so nothing existing breaks.

import { useEffect, useRef, useState } from "react";

export const A11Y_STORAGE_KEY = "ndl_a11y_settings";
export const MIN_FONT_SCALE = 85;
export const MAX_FONT_SCALE = 150;
export const FONT_STEP = 10;

export interface A11ySettings {
  // ── Phase B1 ─────────────────────────────────────────────────────
  fontScale: number;
  highContrast: boolean;
  darkMode: boolean;
  readingMode: boolean;
  focusMode: boolean;

  // ── Phase B3: Reading Ruler ─────────────────────────────────────
  rulerEnabled: boolean;
  rulerThickness: number; // px, 4–40
  rulerColor: string;     // hex

  // ── Phase B3: Reading Mask ───────────────────────────────────────
  maskEnabled: boolean;
  maskHeight: number;  // px, 60–320
  maskOpacity: number; // 0–100

  // ── Phase B3: Dyslexia Mode ──────────────────────────────────────
  dyslexiaMode: boolean;
  letterSpacing: number;    // px, 0–4
  wordSpacing: number;      // px, 0–12
  lineSpacing: number;      // line-height multiplier, 1.2–2.4
  paragraphSpacing: number; // px, 0–32

  // ── Phase B3: Visual Comfort ──────────────────────────────────────
  brightness: number; // %, 50–150
  contrast: number;   // %, 50–150
  sepia: boolean;
  paperMode: boolean;
  grayscale: boolean;
}

export const DEFAULT_A11Y_SETTINGS: A11ySettings = {
  fontScale: 100, highContrast: false, darkMode: false, readingMode: false, focusMode: false,
  rulerEnabled: false, rulerThickness: 10, rulerColor: "#f59e0b",
  maskEnabled: false, maskHeight: 140, maskOpacity: 55,
  dyslexiaMode: false, letterSpacing: 0, wordSpacing: 0, lineSpacing: 1.5, paragraphSpacing: 12,
  brightness: 100, contrast: 100, sepia: false, paperMode: false, grayscale: false,
};

export function loadA11ySettings(): A11ySettings {
  if (typeof window === "undefined") return DEFAULT_A11Y_SETTINGS;
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_SETTINGS;
    return { ...DEFAULT_A11Y_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_A11Y_SETTINGS; }
}

// Every filter-based effect (the existing High Contrast/Dark Mode toggles
// plus the new Brightness/Contrast/Grayscale/Sepia comfort controls) is
// combined into ONE string and applied as a single inline style. Two
// separate CSS rules that each set `filter` can't compose — whichever
// rule is later in the stylesheet simply wins and silently discards the
// other — so this is computed centrally instead of split across
// app/globals.css attribute selectors.
export function computeFilter(s: A11ySettings): string {
  const parts: string[] = [];
  if (s.highContrast) parts.push("contrast(1.3)", "saturate(1.15)");
  if (s.brightness !== 100) parts.push(`brightness(${s.brightness}%)`);
  if (s.contrast !== 100) parts.push(`contrast(${s.contrast}%)`);
  if (s.grayscale) parts.push("grayscale(1)");
  if (s.sepia) parts.push("sepia(0.6)");
  // Dark mode's invert must stay LAST — it flips the whole page, so
  // anything composed before it (brightness/contrast/etc.) still reads
  // correctly once inverted back by the img/video/canvas counter-rule
  // in globals.css.
  if (s.darkMode) parts.push("invert(1)", "hue-rotate(180deg)");
  return parts.length ? parts.join(" ") : "none";
}

// Applies settings to <html> via data-a11y-* attributes/inline style —
// the matching CSS rules live in app/globals.css. Deliberately does NOT
// touch any component's own markup or classes.
export function applyA11ySettings(settings: A11ySettings) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.style.fontSize = `${settings.fontScale}%`;
  html.style.filter = computeFilter(settings);
  html.setAttribute("data-a11y-contrast", String(settings.highContrast));
  html.setAttribute("data-a11y-dark", String(settings.darkMode));
  html.setAttribute("data-a11y-reading", String(settings.readingMode));
  html.setAttribute("data-a11y-focus", String(settings.focusMode));
  html.setAttribute("data-a11y-paper", String(settings.paperMode));
  html.setAttribute("data-a11y-dyslexia", String(settings.dyslexiaMode));
  html.style.setProperty("--a11y-letter-spacing", `${settings.letterSpacing}px`);
  html.style.setProperty("--a11y-word-spacing", `${settings.wordSpacing}px`);
  html.style.setProperty("--a11y-line-height", String(settings.lineSpacing));
  html.style.setProperty("--a11y-paragraph-spacing", `${settings.paragraphSpacing}px`);
  try { window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

// Shared hook: one instance of this state per page (AccessibilityToolbar
// owns it and passes settings/setSettings down to VoiceAssistant and the
// Reading Ruler/Mask overlays as props), so every consumer always reads
// and writes the same in-memory state instead of racing separate
// localStorage copies.
export function useA11ySettings() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_A11Y_SETTINGS);

  useEffect(() => {
    setSettings(loadA11ySettings());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyA11ySettings(settings);
  }, [settings, mounted]);

  // Functional updates only — see stepFontScale/toggle/setNumber below —
  // so rapid successive calls (e.g. two voice commands, or a voice
  // command right after a toolbar click) always compound against the
  // LATEST settings rather than a value captured at an earlier render.
  function stepFontScale(delta: number) {
    setSettings(prev => ({
      ...prev,
      fontScale: Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, prev.fontScale + delta)),
    }));
  }
  function setToggle(key: BooleanA11yKey, value: boolean) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }
  function toggle(key: BooleanA11yKey) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function setNumber(key: NumericA11yKey, value: number) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  return { mounted, settings, setSettings, stepFontScale, setToggle, toggle, setNumber };
}

export type BooleanA11yKey = {
  [K in keyof A11ySettings]: A11ySettings[K] extends boolean ? K : never;
}[keyof A11ySettings];
export type NumericA11yKey = {
  [K in keyof A11ySettings]: A11ySettings[K] extends number ? K : never;
}[keyof A11ySettings];

// Ref-backed accessor for consumers (VoiceAssistant) that need the LATEST
// settings inside an event-listener closure registered once on mount,
// without re-subscribing that listener on every settings change.
export function useA11ySettingsRef(settings: A11ySettings) {
  const ref = useRef(settings);
  useEffect(() => { ref.current = settings; }, [settings]);
  return ref;
}
