import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export default function SettingsPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link href="/" className="text-blue-600 font-semibold">
          ← Back to Library
        </Link>

        <div className="mt-8 bg-gradient-to-r from-slate-900 to-blue-900 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">Settings</h1>

          <p className="mt-4 text-lg text-blue-100 max-w-3xl">
            Manage reading preferences, accessibility, language, AI behavior,
            privacy, and learning personalization.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-10">
          <section className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold">Language Preferences</h2>

            <div className="mt-6 space-y-4">
              {["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"].map(
                (language) => (
                  <div key={language} className="flex justify-between border-b pb-3">
                    <span>{language}</span>
                    <span className="text-green-600 font-semibold">Available</span>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold">Accessibility</h2>

            <div className="mt-6 space-y-4">
              {[
                "Read aloud",
                "Voice commands",
                "Dark mode",
                "Large text mode",
                "Elder friendly explanations",
              ].map((item) => (
                <div key={item} className="flex justify-between border-b pb-3">
                  <span>{item}</span>
                  <span className="text-green-600 font-semibold">Enabled</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold">AI Preferences</h2>

            <div className="mt-6 space-y-4">
              {[
                ["Default Study Mode", "Student"],
                ["AI Model", "gpt-4o-mini"],
                ["Multilingual AI", "Enabled"],
                ["Quiz Generation", "Enabled"],
                ["Smart Notes", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-3">
                  <span>{label}</span>
                  <span className="font-semibold text-blue-600">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold">Privacy & Session</h2>

            <div className="mt-6 space-y-4">
              {[
                "Clear AI chat memory",
                "Clear saved notes",
                "Reset reading progress",
                "Manage uploaded PDFs",
              ].map((item) => (
                <button
                  key={item}
                  className="w-full text-left bg-slate-100 hover:bg-slate-200 px-5 py-4 rounded-2xl"
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