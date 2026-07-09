"use client";

import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import PageHeader from "@/components/ui/PageHeader";

export default function SettingsPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Settings"
          subtitle="Manage reading preferences, accessibility, language, AI behavior, privacy, and learning personalization."
          homeLabel="Back to Library"
        />

        <div className="grid lg:grid-cols-2 gap-6 mt-4">
          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">Language Preferences</h2>

            <div className="mt-6 space-y-4">
              {["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"].map(
                (language) => (
                  <div key={language} className="flex justify-between border-b border-slate-100 pb-3">
                    <span className="text-slate-700">{language}</span>
                    <span className="text-green-600 font-semibold">Available</span>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">Accessibility</h2>

            <div className="mt-6 space-y-4">
              {[
                "Read aloud",
                "Voice commands",
                "Dark mode",
                "Large text mode",
                "Elder friendly explanations",
              ].map((item) => (
                <div key={item} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{item}</span>
                  <span className="text-green-600 font-semibold">Enabled</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">AI Preferences</h2>

            <div className="mt-6 space-y-4">
              {[
                ["Default Study Mode", "Student"],
                ["AI Model", "gpt-4o-mini"],
                ["Multilingual AI", "Enabled"],
                ["Quiz Generation", "Enabled"],
                ["Smart Notes", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{label}</span>
                  <span className="font-semibold text-blue-600">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-2xl font-black text-slate-900">Privacy & Session</h2>

            <div className="mt-6 space-y-4">
              {[
                "Clear AI chat memory",
                "Clear saved notes",
                "Reset reading progress",
                "Manage uploaded PDFs",
              ].map((item) => (
                <button
                  key={item}
                  className="w-full text-left bg-slate-100 hover:bg-slate-200 px-5 py-4 rounded-2xl text-slate-700 font-medium transition"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}