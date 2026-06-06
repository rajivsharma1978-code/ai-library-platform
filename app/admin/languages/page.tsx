"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

const languages = [
  { name: "English", code: "EN", books: 6420, coverage: 98, aiSupport: true, voiceSupport: true, ocrSupport: true, status: "Active" },
  { name: "Hindi", code: "HI", books: 2840, coverage: 92, aiSupport: true, voiceSupport: true, ocrSupport: true, status: "Active" },
  { name: "Bengali", code: "BN", books: 1120, coverage: 84, aiSupport: true, voiceSupport: true, ocrSupport: false, status: "Active" },
  { name: "Tamil", code: "TA", books: 980, coverage: 78, aiSupport: true, voiceSupport: false, ocrSupport: true, status: "Active" },
  { name: "Telugu", code: "TE", books: 760, coverage: 64, aiSupport: true, voiceSupport: false, ocrSupport: false, status: "Active" },
  { name: "Marathi", code: "MR", books: 540, coverage: 69, aiSupport: true, voiceSupport: false, ocrSupport: false, status: "Active" },
  { name: "Kannada", code: "KN", books: 310, coverage: 52, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Beta" },
  { name: "Gujarati", code: "GU", books: 280, coverage: 48, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Beta" },
  { name: "Punjabi", code: "PA", books: 190, coverage: 41, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Planned" },
  { name: "Urdu", code: "UR", books: 150, coverage: 35, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Planned" },
  { name: "Odia", code: "OR", books: 120, coverage: 30, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Planned" },
  { name: "Sanskrit", code: "SA", books: 80, coverage: 22, aiSupport: false, voiceSupport: false, ocrSupport: false, status: "Planned" },
];

const coverageColor = (pct: number) => {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 60) return "bg-blue-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-400";
};

const statusStyle: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Beta: "bg-yellow-100 text-yellow-700",
  Planned: "bg-slate-100 text-slate-500",
};

export default function LanguagesPage() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Languages</p>
          <h2 className="text-4xl font-bold mt-2">Language Management</h2>
          <p className="mt-3 text-emerald-100">Manage multilingual coverage, AI support, voice reading, and OCR for all 22 scheduled languages of India.</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            [languages.filter(l => l.status === "Active").length, "Active Languages", "text-green-600"],
            [languages.filter(l => l.status === "Beta").length, "In Beta", "text-yellow-600"],
            [languages.filter(l => l.status === "Planned").length, "Planned", "text-slate-500"],
            [languages.filter(l => l.aiSupport).length, "AI-Supported", "text-blue-600"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Language grid */}
        <div className="grid grid-cols-1 gap-4 mt-6">
          {languages.map((lang) => (
            <div key={lang.code} className="bg-white rounded-2xl p-6 shadow flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-xl text-slate-700 shrink-0">
                {lang.code}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-slate-800 text-lg">{lang.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle[lang.status]}`}>
                    {lang.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 h-2.5 rounded-full">
                    <div className={`h-2.5 rounded-full ${coverageColor(lang.coverage)}`} style={{ width: `${lang.coverage}%` }} />
                  </div>
                  <span className="text-sm text-slate-500 shrink-0">{lang.coverage}% coverage</span>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-800">{lang.books.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Books</p>
                </div>
                <div className="flex gap-2">
                  {[
                    ["🤖", "AI", lang.aiSupport],
                    ["🔊", "Voice", lang.voiceSupport],
                    ["🔍", "OCR", lang.ocrSupport],
                  ].map(([icon, label, enabled]) => (
                    <div
                      key={String(label)}
                      title={String(label)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-base ${
                        enabled ? "bg-green-100" : "bg-slate-100 opacity-40"
                      }`}
                    >
                      {icon}
                    </div>
                  ))}
                </div>
                <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition">
                  Configure
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
