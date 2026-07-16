"use client";

import { useEffect, useState } from "react";
import { UI_TEXT, LANGUAGE_NAMES, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { useEnabledLanguages } from "@/lib/languageSettings";
import { useA11ySettings } from "@/lib/accessibilitySettings";
import PageHeader from "@/components/ui/PageHeader";

// Local toggle row for the Accessibility section — mirrors the row style
// (icon + label + right-aligned status pill) the rest of this page already
// used for its old static "Enabled" badges, just made clickable. Used only
// for the four REAL persisted ndl_a11y_settings toggles.
function ToggleRow({ icon, label, active, onLabel, offLabel, onToggle }: {
  icon: string; label: string; active: boolean; onLabel: string; offLabel: string; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <span className="flex items-center gap-2 text-slate-700">
        <span aria-hidden="true">{icon}</span>{label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
          active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {active ? onLabel : offLabel}
      </button>
    </div>
  );
}

// Read Aloud is a page ACTION (Web Speech API), not a persisted setting —
// deliberately a separate component from ToggleRow, with its own color
// scheme and action-verb labels ("Start Reading"/"Stop Reading") instead of
// the On/Off state pill, so it never reads as a saved ndl_a11y_settings
// preference the way the four real toggles below it do.
function ReadAloudRow({ icon, label, speaking, startLabel, stopLabel, onToggle }: {
  icon: string; label: string; speaking: boolean; startLabel: string; stopLabel: string; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <span className="flex items-center gap-2 text-slate-700">
        <span aria-hidden="true">{icon}</span>{label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={speaking}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
          speaking ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"
        }`}
      >
        {speaking ? stopLabel : startLabel}
      </button>
    </div>
  );
}

// BCP-47 locale tags for SpeechSynthesisUtterance — best-effort so the
// browser's TTS voice matches the language currently being read, not just
// the text content.
const SPEECH_LOCALE: Record<Language, string> = {
  en: "en-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN",
};

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const t = UI_TEXT[language];
  const enabledLanguages = useEnabledLanguages();
  const { settings, toggle } = useA11ySettings();

  // Read Aloud — same self-contained technique AccessibilityToolbar already
  // uses (Web Speech API over the current <main> text), reimplemented here
  // rather than imported since it's local UI state, not part of the
  // persisted A11ySettings schema. This is a momentary page ACTION, never
  // written to ndl_a11y_settings.
  const [speaking, setSpeaking] = useState(false);

  // Cancel on unmount (covers client-side navigation away from this page).
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Cancel whenever the interface language changes — the in-flight
  // utterance was built from the previous language's text/voice, so it
  // must not keep playing once the page has re-rendered in a new language.
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [language]);

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
    utt.lang = SPEECH_LOCALE[language];
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    // Cancel any existing speech before starting — prevents overlapping
    // sessions if a previous utterance is still in flight.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
  }

  // Privacy & Session — require confirmation before any destructive action,
  // then report what happened through an aria-live region.
  const [confirming, setConfirming] = useState<"notes" | "progress" | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  function askConfirm(which: "notes" | "progress") {
    setStatusMessage("");
    setConfirming(which);
  }

  function clearSavedNotes() {
    try {
      window.localStorage.removeItem("ndl_notes");
      window.localStorage.removeItem("ndl_ai_notes");
    } catch {}
    setConfirming(null);
    setStatusMessage(t.settingsNotesCleared);
  }

  function resetReadingProgress() {
    try {
      window.localStorage.removeItem("ndl_reading_progress");
      window.localStorage.removeItem("ndl_continue_reading");
    } catch {}
    setConfirming(null);
    setStatusMessage(t.settingsProgressReset);
  }

  const languageOptions = (Object.entries(LANGUAGE_NAMES) as [Language, string][])
    .filter(([code]) => enabledLanguages.includes(code));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={t.aiTutorNavSettings}
          subtitle={t.settingsSubtitle}
          homeLabel={t.settingsBackToLibrary}
        />

        <div className="grid lg:grid-cols-2 gap-6 mt-4">
          {/* ── Language Preferences ────────────────────────────────── */}
          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">{t.settingsLanguagePreferences}</h2>

            <div className="mt-6">
              <label htmlFor="settings-language-select" className="block text-xs font-bold uppercase tracking-wide text-slate-400">
                {t.settingsInterfaceLanguageLabel}
              </label>
              <select
                id="settings-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
              >
                {languageOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">{t.settingsLanguageNote}</p>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.settingsAvailableLanguages}</p>
              <div className="mt-3 space-y-4">
                {languageOptions.map(([code, name]) => (
                  <div key={code} className="flex justify-between border-b border-slate-100 pb-3">
                    <span className="text-slate-700">{name}</span>
                    <span className="text-green-600 font-semibold">{t.commonAvailable}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Accessibility ────────────────────────────────────────── */}
          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">{t.settingsAccessibility}</h2>

            <div className="mt-6 space-y-4">
              <ReadAloudRow icon="🔊" label={t.settingsReadAloud} speaking={speaking} startLabel={t.settingsStartReading} stopLabel={t.settingsStopReading} onToggle={toggleReadAloud} />
              <ToggleRow icon="🌙" label={t.settingsDarkMode} active={settings.darkMode} onLabel={t.settingsStateOn} offLabel={t.settingsStateOff} onToggle={() => toggle("darkMode")} />
              <ToggleRow icon="◐" label={t.settingsHighContrast} active={settings.highContrast} onLabel={t.settingsStateOn} offLabel={t.settingsStateOff} onToggle={() => toggle("highContrast")} />
              <ToggleRow icon="📖" label={t.settingsReadingMode} active={settings.readingMode} onLabel={t.settingsStateOn} offLabel={t.settingsStateOff} onToggle={() => toggle("readingMode")} />
              <ToggleRow icon="🎯" label={t.settingsFocusMode} active={settings.focusMode} onLabel={t.settingsStateOn} offLabel={t.settingsStateOff} onToggle={() => toggle("focusMode")} />
            </div>
          </section>

          {/* ── AI Engine Configuration (read-only) ──────────────────── */}
          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">{t.settingsAiEngineConfig}</h2>
            <p className="mt-1 text-xs font-semibold text-amber-700">{t.settingsAiFixedNote}</p>

            <div className="mt-6 space-y-4">
              {[
                [t.settingsDefaultStudyMode, "Student"],
                [t.settingsAiModel, "gpt-4o-mini"],
                [t.settingsMultilingualAi, t.commonEnabled],
                [t.settingsQuizGeneration, t.commonEnabled],
                [t.settingsSmartNotes, t.commonEnabled],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{label}</span>
                  <span className="font-semibold text-blue-600">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Privacy & Session ─────────────────────────────────────── */}
          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">{t.settingsPrivacySession}</h2>

            <div className="mt-6 space-y-4">
              {confirming === "notes" ? (
                <div className="rounded-2xl bg-red-50 p-5">
                  <p className="text-sm font-semibold text-red-700">{t.settingsConfirmClearNotes}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={clearSavedNotes} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
                      {t.settingsConfirmClear}
                    </button>
                    <button onClick={() => setConfirming(null)} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                      {t.commonCancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => askConfirm("notes")}
                  className="w-full text-left bg-slate-100 hover:bg-slate-200 px-5 py-4 rounded-2xl text-slate-700 font-medium transition"
                >
                  {t.settingsClearSavedNotes}
                </button>
              )}

              {confirming === "progress" ? (
                <div className="rounded-2xl bg-red-50 p-5">
                  <p className="text-sm font-semibold text-red-700">{t.settingsConfirmResetProgress}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={resetReadingProgress} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
                      {t.settingsConfirmClear}
                    </button>
                    <button onClick={() => setConfirming(null)} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                      {t.commonCancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => askConfirm("progress")}
                  className="w-full text-left bg-slate-100 hover:bg-slate-200 px-5 py-4 rounded-2xl text-slate-700 font-medium transition"
                >
                  {t.settingsResetReadingProgress}
                </button>
              )}

              <div aria-live="polite" role="status" className="min-h-[1.5rem] text-sm font-semibold text-green-700">
                {statusMessage}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
