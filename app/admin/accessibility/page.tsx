"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const features = [
  { name: "Read Aloud (TTS)", desc: "Text-to-speech for all books in 6 languages", status: true, coverage: 94 },
  { name: "Voice Commands", desc: "Navigate library hands-free via microphone", status: true, coverage: 88 },
  { name: "High Contrast Mode", desc: "Increased contrast for visually impaired users", status: true, coverage: 100 },
  { name: "Large Text Mode", desc: "Scalable font sizes up to 200%", status: true, coverage: 100 },
  { name: "Elder-Friendly Mode", desc: "Simplified UI with larger tap targets for seniors", status: true, coverage: 76 },
  { name: "Screen Reader Support", desc: "Full ARIA labels and semantic HTML compliance", status: true, coverage: 82 },
  { name: "Braille Output", desc: "Export content in BRF format for braille displays", status: false, coverage: 0 },
  { name: "Sign Language Video", desc: "ISL (Indian Sign Language) explanations for key topics", status: false, coverage: 12 },
  { name: "Dyslexia-Friendly Font", desc: "OpenDyslexic font option across all reading views", status: true, coverage: 100 },
  { name: "Keyboard-Only Navigation", desc: "Full platform usability without a mouse", status: true, coverage: 91 },
];

const languageTTS = [
  { lang: "English", voices: 4, status: "Full" },
  { lang: "Hindi", voices: 3, status: "Full" },
  { lang: "Bengali", voices: 2, status: "Partial" },
  { lang: "Tamil", voices: 1, status: "Partial" },
  { lang: "Telugu", voices: 1, status: "Partial" },
  { lang: "Marathi", voices: 1, status: "Partial" },
  { lang: "Kannada", voices: 0, status: "Planned" },
  { lang: "Gujarati", voices: 0, status: "Planned" },
];

export default function AccessibilityPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();
  const [features_, setFeatures] = useState(features);

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") router.push("/admin-login");
  }, [router]);

  const toggle = (name: string) => {
    setFeatures(f => f.map(item => item.name === name ? { ...item, status: !item.status } : item));
  };

  const overallScore = Math.round(
    features_.filter(f => f.status).reduce((sum, f) => sum + f.coverage, 0) / features_.length
  );

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Accessibility</p>
          <h2 className="text-4xl font-bold mt-2">Accessibility Management</h2>
          <p className="mt-3 text-amber-100">Ensure the library is fully accessible — manage TTS, screen readers, elder-friendly modes, and WCAG compliance.</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            [`${overallScore}%`, "Overall A11y Score", "text-amber-600"],
            [features_.filter(f => f.status).length, "Active Features", "text-green-600"],
            [features_.filter(f => !f.status).length, "Disabled / Planned", "text-slate-400"],
            ["WCAG 2.1 AA", "Compliance Level", "text-blue-600"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Feature toggles */}
        <div className="bg-white rounded-3xl p-8 shadow mt-8">
          <h3 className="text-xl font-bold mb-6">Accessibility Features</h3>
          <div className="space-y-4">
            {features_.map((feat) => (
              <div key={feat.name} className="flex items-center gap-5 border border-slate-100 rounded-2xl p-4">
                <button
                  onClick={() => toggle(feat.name)}
                  className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${feat.status ? "bg-green-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${feat.status ? "left-6" : "left-0.5"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{feat.name}</p>
                  <p className="text-sm text-slate-400">{feat.desc}</p>
                </div>
                {feat.coverage > 0 && (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-28 bg-slate-200 h-2 rounded-full">
                      <div className={`h-2 rounded-full ${feat.coverage >= 80 ? "bg-green-500" : feat.coverage >= 50 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${feat.coverage}%` }} />
                    </div>
                    <span className="text-sm text-slate-500 w-10 text-right">{feat.coverage}%</span>
                  </div>
                )}
                {feat.coverage === 0 && (
                  <span className="text-xs text-slate-400 shrink-0">Not started</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* TTS language support */}
        <div className="bg-white rounded-3xl p-8 shadow mt-8">
          <h3 className="text-xl font-bold mb-6">Text-to-Speech Language Coverage</h3>
          <div className="grid grid-cols-4 gap-4">
            {languageTTS.map((l) => (
              <div key={l.lang} className="border border-slate-100 rounded-2xl p-5 text-center">
                <p className="font-bold text-slate-800 text-lg">{l.lang}</p>
                <p className="text-3xl font-bold mt-2 text-blue-600">{l.voices}</p>
                <p className="text-xs text-slate-400">voices</p>
                <span className={`mt-3 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  l.status === "Full" ? "bg-green-100 text-green-700" :
                  l.status === "Partial" ? "bg-yellow-100 text-yellow-700" :
                  "bg-slate-100 text-slate-500"
                }`}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
