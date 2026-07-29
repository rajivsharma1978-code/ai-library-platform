"use client";

// ── Universal Accessibility Toolbar ─────────────────────────────────────
// One shared, self-contained component rendered once per page. It never
// touches page layout — it's a fixed-position floating control, so
// dropping <AccessibilityToolbar /> anywhere in a page's JSX is the only
// integration needed, with zero risk to that page's own business logic.
//
// Settings (font scale, high contrast, dark mode, reading mode, focus
// mode) persist to localStorage and are applied globally via attributes/
// inline style on <html> — see the matching CSS in app/globals.css. This
// deliberately does NOT touch any component's own markup or classes, so
// it works identically across every page without per-page CSS changes.
//
// Read Aloud here is a NEW, generic "read whatever's in <main> right now"
// utility — separate from the existing AI-powered Read Aloud features in
// app/revision/page.tsx and the Premium Reader's AI Companion, which are
// untouched and keep working exactly as before.

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/useLanguage";
import { UI_TEXT, type Language } from "@/lib/i18n";
import { useA11ySettings, MIN_FONT_SCALE, MAX_FONT_SCALE, FONT_STEP, DEFAULT_A11Y_SETTINGS } from "@/lib/accessibilitySettings";
import VoiceAssistant from "@/components/ui/VoiceAssistant";
import { ReadingRuler, ReadingMask } from "@/components/ui/ReadingOverlays";
import FloatingControlsDock from "@/components/ui/FloatingControlsDock";
import { useAdaptivePanelPlacement } from "@/lib/panelPlacement";

const TEXT: Record<Language, Record<string, string>> = {
  en: {
    toolbarLabel: "Accessibility Settings", close: "Close",
    readAloud: "Read Aloud", stopReading: "Stop Reading",
    fontSize: "Font Size", fontIncrease: "Font Size +", fontDecrease: "Font Size -",
    highContrast: "High Contrast", darkMode: "Dark Mode",
    readingMode: "Reading Mode", focusMode: "Focus Mode",
    on: "On", off: "Off", reset: "Reset to Default",
  },
  hi: {
    toolbarLabel: "सुगम्यता सेटिंग्स", close: "बंद करें",
    readAloud: "ज़ोर से पढ़ें", stopReading: "पढ़ना रोकें",
    fontSize: "फ़ॉन्ट आकार", fontIncrease: "फ़ॉन्ट आकार +", fontDecrease: "फ़ॉन्ट आकार -",
    highContrast: "उच्च कंट्रास्ट", darkMode: "डार्क मोड",
    readingMode: "पठन मोड", focusMode: "फोकस मोड",
    on: "चालू", off: "बंद", reset: "डिफ़ॉल्ट पर रीसेट करें",
  },
  ta: {
    toolbarLabel: "அணுகல்தன்மை அமைப்புகள்", close: "மூடு",
    readAloud: "சத்தமாக படிக்கவும்", stopReading: "படிப்பதை நிறுத்து",
    fontSize: "எழுத்துரு அளவு", fontIncrease: "எழுத்துரு அளவு +", fontDecrease: "எழுத்துரு அளவு -",
    highContrast: "அதிக மாறுபாடு", darkMode: "இருள் பயன்முறை",
    readingMode: "வாசிப்பு பயன்முறை", focusMode: "கவனம் பயன்முறை",
    on: "இயக்கு", off: "நிறுத்து", reset: "இயல்புநிலைக்கு மீட்டமை",
  },
  bn: {
    toolbarLabel: "অ্যাক্সেসিবিলিটি সেটিংস", close: "বন্ধ করুন",
    readAloud: "জোরে পড়ুন", stopReading: "পড়া থামান",
    fontSize: "ফন্ট আকার", fontIncrease: "ফন্ট আকার +", fontDecrease: "ফন্ট আকার -",
    highContrast: "উচ্চ কনট্রাস্ট", darkMode: "ডার্ক মোড",
    readingMode: "পঠন মোড", focusMode: "ফোকাস মোড",
    on: "চালু", off: "বন্ধ", reset: "ডিফল্টে রিসেট করুন",
  },
  te: {
    toolbarLabel: "అందుబాటు సెట్టింగ్‌లు", close: "మూసివేయండి",
    readAloud: "బిగ్గరగా చదవండి", stopReading: "చదవడం ఆపండి",
    fontSize: "ఫాంట్ పరిమాణం", fontIncrease: "ఫాంట్ పరిమాణం +", fontDecrease: "ఫాంట్ పరిమాణం -",
    highContrast: "అధిక కాంట్రాస్ట్", darkMode: "డార్క్ మోడ్",
    readingMode: "రీడింగ్ మోడ్", focusMode: "ఫోకస్ మోడ్",
    on: "ఆన్", off: "ఆఫ్", reset: "డిఫాల్ట్‌కు రీసెట్ చేయండి",
  },
  mr: {
    toolbarLabel: "सुलभता सेटिंग्ज", close: "बंद करा",
    readAloud: "मोठ्याने वाचा", stopReading: "वाचणे थांबवा",
    fontSize: "फॉन्ट आकार", fontIncrease: "फॉन्ट आकार +", fontDecrease: "फॉन्ट आकार -",
    highContrast: "उच्च कॉन्ट्रास्ट", darkMode: "डार्क मोड",
    readingMode: "वाचन मोड", focusMode: "फोकस मोड",
    on: "चालू", off: "बंद", reset: "मूळ स्थितीत आणा",
  },
};

type AccessibilityToolbarProps = {
  /** Phase D2: the Premium Reader's mobile bottom nav has its own
   *  "Accessibility" entry point that duplicates this component's own
   *  floating ♿ trigger — set true (mobile-only, from that one call
   *  site) to hide just the trigger button. The panel/open state, the
   *  ndl-open-accessibility-panel listener below, VoiceAssistant, and
   *  the Reading Ruler/Mask are all untouched and keep working. Every
   *  other page in the app renders <AccessibilityToolbar /> with no
   *  props, so this defaults to false and changes nothing there. */
  hideTrigger?: boolean;
  /** Phase D2: the Premium Reader's mobile "Accessibility" sheet must be
   *  a translucent/blurred glass panel with the PDF visible behind it,
   *  not the existing opaque bottom sheet every other page still uses.
   *  "glass" swaps ONLY the panel's JSX/styling below — same settings
   *  object, same toggle/setNumber/stepFontScale calls, same
   *  toggleRow/sliderRow/sectionHeader helpers, so there is no second
   *  copy of the settings logic. Defaults to "default" everywhere else. */
  variant?: "default" | "glass";
};

export default function AccessibilityToolbar({ hideTrigger = false, variant = "default" }: AccessibilityToolbarProps = {}) {
  const { language } = useLanguage();
  const { mounted, settings, setSettings, stepFontScale, setToggle, toggle, setNumber } = useA11ySettings();
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [expanded, setExpanded] = useState({ ruler: false, text: false, visual: false });
  // Adaptive placement (Issue 1 fix): the panel used to just be a normal
  // flex child that always grew upward from the trigger, which assumed
  // the dock was anchored bottom-right. Now that the dock is draggable
  // to any edge, the panel is fixed-positioned and placed by
  // computePanelPlacement based on the trigger's real on-screen rect —
  // expanding away from whichever edge is nearest and always clamped
  // fully inside the viewport.
  const { triggerRef, panelRef, placement } = useAdaptivePanelPlacement(open, 320);

  // ── Phase C1: mobile presentation ────────────────────────────────────
  // Below 640px the floating popover (which can grow to nearly full
  // viewport height via computePanelPlacement's maxHeight) is replaced
  // with a bounded bottom sheet instead, so a meaningful strip of the
  // page — the book, in the Premium Reader — always stays visible above
  // it, and every toggle/slider here still applies live to that same
  // visible page (nothing about how settings apply changed, only this
  // panel's own container size/position). Desktop/tablet are untouched:
  // they keep using `placement` from the adaptive-position hook above.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 640); }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // isHydrated-style gate: SSR/first render always uses English text and
  // default settings (identical to what every page already renders today),
  // so this component can never cause a hydration mismatch. Real settings
  // load and apply strictly after mount.
  const t = TEXT[mounted ? language : "en"];
  // Phase B3 controls are new labels only — routed through the CENTRAL
  // UI_TEXT (per that phase's explicit "all labels through UI_TEXT"
  // requirement), unlike this toolbar's own pre-existing TEXT map above.
  const ut = UI_TEXT[(mounted ? language : "en") as Language];

  function toggleSection(key: keyof typeof expanded) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Close the panel on outside click, and always stop any active speech
  // when this instance unmounts (i.e. on page navigation, since each page
  // renders its own toolbar instance) so audio never keeps playing on a
  // page the user already left.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Phase D1 (Premium Reader mobile redesign): the new mobile bottom
  // nav's "Settings" entry point has no direct handle into this
  // component's own `open` state, so it dispatches this event instead
  // of reaching in — same pattern as the existing `ndl-voice-command`
  // window event elsewhere in the app. Purely additive: nothing about
  // the panel's own settings/behavior changes, this only adds one more
  // way to open it alongside the existing trigger button below.
  useEffect(() => {
    function onOpenRequest() { setOpen(true); }
    window.addEventListener("ndl-open-accessibility-panel", onOpenRequest);
    return () => window.removeEventListener("ndl-open-accessibility-panel", onOpenRequest);
  }, []);

  // Phase D3: the mobile immersive-mode tap gesture closes any open
  // glass panel as part of entering immersive mode (spec point 1) — same
  // remote-control pattern as the open event above, so the gesture
  // handler (PremiumReaderPreviewContent) doesn't need a ref into this
  // component's internal `open` state either.
  useEffect(() => {
    function onCloseRequest() { setOpen(false); }
    window.addEventListener("ndl-close-accessibility-panel", onCloseRequest);
    return () => window.removeEventListener("ndl-close-accessibility-panel", onCloseRequest);
  }, []);

  // Landscape reader fix: broadcasts the REAL open/close state on every
  // transition, however it happened (this panel's own ✕, its backdrop
  // tap, the events above, Escape) — the reader's own pointer-gesture
  // layer (PremiumReaderPreviewContent) listens for this to suppress
  // swipe/pinch/long-press while the panel is open, since the panel is
  // portaled outside that component's own DOM subtree and has no other
  // way to know the panel's current state.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ndl-accessibility-panel-state", { detail: { open } }));
  }, [open]);

  function toggleReadAloud() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const main = document.querySelector("main");
    const text = (main?.innerText || document.body.innerText || "").trim().slice(0, 4000);
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
  }

  const toggleRow = (label: string, active: boolean, onClick: () => void, icon: string) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition-colors ${
        active ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>{icon}</span>{label}
      </span>
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${active ? "bg-white/20" : "bg-slate-200 text-slate-500"}`}>
        {active ? t.on : t.off}
      </span>
    </button>
  );

  const sliderRow = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, unit = "") => (
    <div key={label} className={`rounded-2xl px-4 py-3 ${settings.darkMode ? "bg-white/10" : "bg-slate-100"}`}>
      <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
        <span>{label}</span>
        <span className="text-xs font-bold opacity-70">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-orange-600"
      />
    </div>
  );

  const sectionHeader = (label: string, key: keyof typeof expanded, icon: string) => (
    <button
      onClick={() => toggleSection(key)}
      aria-expanded={expanded[key]}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-black transition-colors ${settings.darkMode ? "bg-white/10 hover:bg-white/15" : "bg-slate-100 hover:bg-slate-200"}`}
    >
      <span className="flex items-center gap-2"><span aria-hidden>{icon}</span>{label}</span>
      <span aria-hidden className={`transition-transform ${expanded[key] ? "rotate-180" : ""}`}>▾</span>
    </button>
  );

  // ── Phase D2: glass variant (Premium Reader mobile only) ─────────────
  // A translucent, blurred bottom sheet so the PDF stays visible/legible
  // behind it — deliberately a SEPARATE branch from the existing default
  // panel below rather than a modification of it, since the old opaque
  // sheet must keep rendering byte-for-byte everywhere else in the app.
  // Every value/handler is the exact same settings/toggle/setNumber/
  // stepFontScale from the one useA11ySettings() call above — no second
  // copy of any settings logic, only new JSX. Scoped to exactly the 6
  // items D2 asked for (Font Size, Font Family, Line Spacing, Theme,
  // Read Aloud, Reading Aids) — everything else (High Contrast, Focus
  // Mode, Visual Comfort, …) stays reachable only via the existing panel
  // on desktop/tablet and other pages, unchanged.
  const glassPanel = (
    <div
      ref={panelRef}
      data-a11y-no-invert
      // RC1 P1 fix #7: pushed a second notch toward Apple Books/iPadOS
      // Control Center — real-device feedback was this still read as too
      // opaque even at 0.14/0.18. Alpha dropped again (0.14/0.18 →
      // 0.07/0.10) and blur/saturation raised (56px/150% → 64px/180%) so
      // the book underneath is clearly visible through the sheet, not
      // just technically translucent. Row backgrounds bumped a matching
      // notch (bg-white/55 → /62, bg-white/20 → /26 below) so controls
      // stay legible even though the surrounding sheet is now much more
      // see-through.
      className="fixed inset-x-0 bottom-0 z-[161] max-h-[58vh] w-full overflow-y-auto rounded-t-[1.75rem] border-t border-white/40 p-5 text-slate-900 shadow-[0_-10px_60px_rgba(0,0,0,0.35)] backdrop-blur-[64px] backdrop-saturate-[1.8]"
      style={{
        backgroundColor: settings.darkMode ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.07)",
        color: settings.darkMode ? "#fff" : undefined,
        // Phase D3.1 point 8: iPhone Safari's home-indicator safe area —
        // every other mobile sheet in the reader already accounts for
        // this, this one didn't yet.
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className={`mx-auto mb-3 h-1 w-10 rounded-full ${settings.darkMode ? "bg-white/30" : "bg-slate-400/50"}`} />
      <div className="mb-4 flex items-center justify-between">
        {/* Phase D3.1 point 4: "Reading Options" here (not "Accessibility
            Settings") — same ut.a11yReadingOptions key the bottom nav's
            "Reading" button already uses as its title, so the sheet you
            land on always matches what you tapped. */}
        <h2 className="text-lg font-black">{ut.a11yReadingOptions}</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label={t.close}
          className={`rounded-full p-1.5 text-lg leading-none ${settings.darkMode ? "hover:bg-white/10" : "hover:bg-black/5"}`}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* ── Phase D2.1: truthfulness correction ─────────────────────
            The PDF page is a raster <canvas> painted by pdf.js — no CSS
            rule can reach into it to change what FONT it was drawn with
            or how its TEXT is spaced (there is no reflowed/live text
            layer anywhere in this app; app/read/page.tsx and
            MobilePdfPage.tsx are both canvas-only, confirmed by reading
            both files). Font Size/Font Family/Line Spacing below are
            REAL settings (same state as the desktop panel) but they only
            ever affected the app's own HTML chrome, never the book page
            — showing them as live controls here would be exactly the
            "looks like it adjusts the book, actually changes unrelated
            HTML" problem this correction exists to fix. They're kept,
            disabled, and clearly labeled instead of removed, since the
            underlying settings remain real and may back a genuine
            reflowed Text Reading Mode later (D3+) — see the "Text
            Reading Mode" section below.
            Reading Options (Theme + Brightness + Contrast) and Reading
            Aids, by contrast, DO reach the canvas: computeFilter()
            (lib/accessibilitySettings.ts) sets one combined `filter` on
            <body>, which visually composites over every descendant
            including <canvas> — verified against the dark-mode-only
            counter-rule in globals.css (`html[data-a11y-dark] canvas
            { filter: invert(1) hue-rotate(180deg) }`), which exists
            specifically to cancel JUST the invert/hue-rotate term so the
            page doesn't look like a photo negative; brightness/contrast/
            sepia/high-contrast carry no such counter-rule and reach the
            canvas untouched. Reading Aids (Ruler/Mask) are `position:
            fixed` overlays portaled above everything at z-index 9996/
            9997 (components/ui/ReadingOverlays.tsx), so they're visibly
            on top of the PDF by construction. Zoom already lives
            directly in the header, wired straight into MobilePdfPage's
            render scale — genuinely live, nothing to change here. */}
        {/* Phase D3.1: dropped a redundant "Reading Options" sub-label
            here — the sheet's own <h2> above already says that; repeating
            it as the first section header read as clutter, not structure. */}
        {toggleRow(t.darkMode, settings.darkMode, () => toggle("darkMode"), "🌙")}
        {toggleRow(ut.paperModeLabel, settings.paperMode, () => toggle("paperMode"), "📄")}
        {toggleRow(ut.sepiaLabel, settings.sepia, () => toggle("sepia"), "🟤")}
        {sliderRow(ut.brightnessLabel, settings.brightness, 50, 150, 5, v => setNumber("brightness", v), "%")}
        {sliderRow(ut.contrastLabel, settings.contrast, 50, 150, 5, v => setNumber("contrast", v), "%")}

        {/* Reading Aids (Ruler + Mask) — identical to the desktop panel's
            section, same expanded.ruler local state and setNumber calls. */}
        {sectionHeader(ut.sectionReadingAids, "ruler", "📏")}
        {expanded.ruler && (
          <div className="flex flex-col gap-2.5 pl-1">
            {toggleRow(ut.rulerLabel, settings.rulerEnabled, () => toggle("rulerEnabled"), "📏")}
            {settings.rulerEnabled && sliderRow(ut.rulerThickness, settings.rulerThickness, 4, 40, 2, v => setNumber("rulerThickness", v), "px")}
            {settings.rulerEnabled && (
              <div className={`flex items-center justify-between rounded-2xl px-4 py-3 backdrop-blur-sm ${settings.darkMode ? "bg-white/26" : "bg-white/62"}`}>
                <span className="text-sm font-bold">{ut.rulerColor}</span>
                <input
                  type="color"
                  value={settings.rulerColor}
                  onChange={(e) => setSettings(prev => ({ ...prev, rulerColor: e.target.value }))}
                  aria-label={ut.rulerColor}
                  className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent"
                />
              </div>
            )}
            {toggleRow(ut.maskLabel, settings.maskEnabled, () => toggle("maskEnabled"), "🎭")}
            {settings.maskEnabled && sliderRow(ut.maskHeight, settings.maskHeight, 60, 320, 10, v => setNumber("maskHeight", v), "px")}
            {settings.maskEnabled && sliderRow(ut.maskOpacity, settings.maskOpacity, 10, 90, 5, v => setNumber("maskOpacity", v), "%")}
          </div>
        )}

        {/* ── Text Reading Mode (Phase D2.1) ───────────────────────────
            Font Size / Font Family / Line Spacing kept visible so the
            underlying (real) settings aren't hidden, but genuinely
            disabled — no onClick/onChange wired here at all, not just
            styled to look inactive — because none of them reach the
            fixed-layout PDF canvas (see the comment above). No reflow
            engine exists to build "Text Reading Mode" against in this
            task, so this is honestly labeled as unavailable rather than
            faked or silently dropped. */}
        <p className={`mt-1 px-1 text-[10px] font-black uppercase tracking-widest ${settings.darkMode ? "text-white/50" : "text-slate-500"}`}>{ut.a11yTextReadingMode}</p>
        <div aria-disabled className="flex flex-col gap-2.5 opacity-45">
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 backdrop-blur-sm ${settings.darkMode ? "bg-white/26" : "bg-white/62"}`}>
            <span className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden>🔤</span>{t.fontSize}
            </span>
            <div className="flex items-center gap-2">
              <button disabled aria-label={t.fontDecrease} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-400 text-white font-black">−</button>
              <span className="w-10 text-center text-xs font-bold">{settings.fontScale}%</span>
              <button disabled aria-label={t.fontIncrease} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-400 text-white font-black">+</button>
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 backdrop-blur-sm ${settings.darkMode ? "bg-white/26" : "bg-white/62"}`}>
            <span className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden>🔠</span>{ut.dyslexiaLabel}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${settings.darkMode ? "bg-white/20" : "bg-slate-200 text-slate-500"}`}>{t.off}</span>
          </div>
          <div className={`rounded-2xl px-4 py-3 backdrop-blur-sm ${settings.darkMode ? "bg-white/26" : "bg-white/62"}`}>
            <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
              <span>{ut.lineSpacing}</span>
              <span className="text-xs font-bold opacity-70">{settings.lineSpacing.toFixed(1)}×</span>
            </div>
            <input type="range" disabled min={1.2} max={2.4} step={0.1} value={settings.lineSpacing} aria-label={ut.lineSpacing} className="w-full accent-slate-400" />
          </div>
        </div>
        <p className={`px-1 text-[11px] font-semibold ${settings.darkMode ? "text-white/50" : "text-slate-500"}`}>
          🔒 {ut.a11yAvailableInTextReadingMode}
        </p>
      </div>

      <button
        onClick={() => setSettings(DEFAULT_A11Y_SETTINGS)}
        className={`mt-4 w-full rounded-2xl px-4 py-2.5 text-xs font-bold ${settings.darkMode ? "text-white/70 hover:bg-white/10" : "text-slate-600 hover:bg-black/5"}`}
      >
        {t.reset}
      </button>
    </div>
  );

  const isGlassMobile = variant === "glass" && isMobile;

  return (
    <FloatingControlsDock>
      {open && isGlassMobile && (
        <>
          {/* Transparent tap-catcher, not a dark dimmer — a background
              tap closes the sheet (Reading First: "background
              interaction blocked where appropriate") without ever
              obscuring the PDF the way the old modal's bg-black/40
              backdrop would. */}
          <div className="fixed inset-0 z-[160]" onClick={() => setOpen(false)} />
          {glassPanel}
        </>
      )}
      {open && !isGlassMobile && (
        <div
          ref={panelRef}
          data-a11y-no-invert
          style={isMobile ? undefined : {
            position: "fixed",
            top: placement?.top,
            left: placement?.left,
            maxHeight: placement?.maxHeight,
            visibility: placement ? "visible" : "hidden",
          }}
          className={
            isMobile
              ? `fixed inset-x-0 bottom-0 z-[161] max-h-[55vh] w-full overflow-y-auto rounded-t-[1.75rem] p-5 shadow-[0_-10px_50px_rgba(75,45,12,0.25)] ring-1 ring-black/5 ${settings.darkMode ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`
              : `w-80 max-w-[90vw] overflow-y-auto rounded-[1.75rem] p-5 shadow-[0_20px_60px_rgba(75,45,12,0.20)] ring-1 ring-black/5 ${settings.darkMode ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`
          }
        >
          {isMobile && (
            <div className={`mx-auto mb-3 h-1 w-10 rounded-full ${settings.darkMode ? "bg-white/20" : "bg-slate-200"}`} />
          )}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">{t.toolbarLabel}</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className={`rounded-full p-1.5 text-lg leading-none ${settings.darkMode ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {toggleRow(speaking ? t.stopReading : t.readAloud, speaking, toggleReadAloud, "🔊")}

            <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${settings.darkMode ? "bg-white/10" : "bg-slate-100"}`}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden>🔤</span>{t.fontSize}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => stepFontScale(-FONT_STEP)}
                  aria-label={t.fontDecrease}
                  disabled={settings.fontScale <= MIN_FONT_SCALE}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white font-black disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-10 text-center text-xs font-bold">{settings.fontScale}%</span>
                <button
                  onClick={() => stepFontScale(FONT_STEP)}
                  aria-label={t.fontIncrease}
                  disabled={settings.fontScale >= MAX_FONT_SCALE}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white font-black disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {toggleRow(t.highContrast, settings.highContrast, () => toggle("highContrast"), "◐")}
            {toggleRow(t.darkMode, settings.darkMode, () => toggle("darkMode"), "🌙")}
            {toggleRow(t.readingMode, settings.readingMode, () => toggle("readingMode"), "📖")}
            {toggleRow(t.focusMode, settings.focusMode, () => toggle("focusMode"), "🎯")}

            {/* ── Phase B3: Reading Aids (Ruler + Mask) ─────────────── */}
            {sectionHeader(ut.sectionReadingAids, "ruler", "📏")}
            {expanded.ruler && (
              <div className="flex flex-col gap-2.5 pl-1">
                {toggleRow(ut.rulerLabel, settings.rulerEnabled, () => toggle("rulerEnabled"), "📏")}
                {settings.rulerEnabled && sliderRow(ut.rulerThickness, settings.rulerThickness, 4, 40, 2, v => setNumber("rulerThickness", v), "px")}
                {settings.rulerEnabled && (
                  <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${settings.darkMode ? "bg-white/10" : "bg-slate-100"}`}>
                    <span className="text-sm font-bold">{ut.rulerColor}</span>
                    <input
                      type="color"
                      value={settings.rulerColor}
                      onChange={(e) => setSettings(prev => ({ ...prev, rulerColor: e.target.value }))}
                      aria-label={ut.rulerColor}
                      className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent"
                    />
                  </div>
                )}
                {toggleRow(ut.maskLabel, settings.maskEnabled, () => toggle("maskEnabled"), "🎭")}
                {settings.maskEnabled && sliderRow(ut.maskHeight, settings.maskHeight, 60, 320, 10, v => setNumber("maskHeight", v), "px")}
                {settings.maskEnabled && sliderRow(ut.maskOpacity, settings.maskOpacity, 10, 90, 5, v => setNumber("maskOpacity", v), "%")}
              </div>
            )}

            {/* ── Phase B3: Text & Spacing (Dyslexia Mode) ──────────── */}
            {sectionHeader(ut.sectionText, "text", "🔡")}
            {expanded.text && (
              <div className="flex flex-col gap-2.5 pl-1">
                {toggleRow(ut.dyslexiaLabel, settings.dyslexiaMode, () => toggle("dyslexiaMode"), "🅰️")}
                {settings.dyslexiaMode && (
                  <>
                    {sliderRow(ut.letterSpacing, settings.letterSpacing, 0, 4, 0.5, v => setNumber("letterSpacing", v), "px")}
                    {sliderRow(ut.wordSpacing, settings.wordSpacing, 0, 12, 1, v => setNumber("wordSpacing", v), "px")}
                    {sliderRow(ut.lineSpacing, settings.lineSpacing, 1.2, 2.4, 0.1, v => setNumber("lineSpacing", v), "×")}
                    {sliderRow(ut.paragraphSpacing, settings.paragraphSpacing, 0, 32, 2, v => setNumber("paragraphSpacing", v), "px")}
                  </>
                )}
              </div>
            )}

            {/* ── Phase B3: Visual Comfort ───────────────────────────── */}
            {sectionHeader(ut.sectionVisualComfort, "visual", "🎨")}
            {expanded.visual && (
              <div className="flex flex-col gap-2.5 pl-1">
                {sliderRow(ut.brightnessLabel, settings.brightness, 50, 150, 5, v => setNumber("brightness", v), "%")}
                {sliderRow(ut.contrastLabel, settings.contrast, 50, 150, 5, v => setNumber("contrast", v), "%")}
                {toggleRow(ut.sepiaLabel, settings.sepia, () => toggle("sepia"), "🟤")}
                {toggleRow(ut.paperModeLabel, settings.paperMode, () => toggle("paperMode"), "📄")}
                {toggleRow(ut.grayscaleLabel, settings.grayscale, () => toggle("grayscale"), "⬛")}
              </div>
            )}
          </div>

          <button
            onClick={() => setSettings(DEFAULT_A11Y_SETTINGS)}
            className={`mt-4 w-full rounded-2xl px-4 py-2.5 text-xs font-bold ${settings.darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {t.reset}
          </button>
        </div>
      )}

      {!hideTrigger && (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          data-dock-handle
          onClick={() => setOpen(o => !o)}
          aria-label={t.toolbarLabel}
          title={t.toolbarLabel}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-xl text-white shadow-lg shadow-orange-500/30 transition-transform hover:-translate-y-0.5 hover:bg-orange-700"
        >
          ♿
        </button>
      )}

      <VoiceAssistant settings={settings} stepFontScale={stepFontScale} setToggle={setToggle} />

      {mounted && <ReadingRuler settings={settings} />}
      {mounted && <ReadingMask settings={settings} />}
    </FloatingControlsDock>
  );
}
