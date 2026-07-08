"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { loadAIUsage, loadActivity, type AdminActivityEntry } from "@/components/admin/adminData";

const DEMO_AI_QUESTIONS = 24;
// Feature breakdown is demo-only — ndl_ai_usage_stats only tracks a single
// total count today, not per-feature usage, so this is clearly labeled.
const DEMO_FEATURE_BREAKDOWN = [
  { feature: "Explain", pct: 32 },
  { feature: "Summarize", pct: 24 },
  { feature: "Quiz", pct: 20 },
  { feature: "Translate", pct: 14 },
  { feature: "Flashcards", pct: 10 },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminAIUsagePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [aiQuestions, setAiQuestions] = useState(0);
  const [lastUsedAt, setLastUsedAt] = useState<number | undefined>(undefined);
  const [usingDemo, setUsingDemo] = useState(false);
  const [aiActivity, setAiActivity] = useState<AdminActivityEntry[]>([]);

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    const usage = loadAIUsage();
    setUsingDemo(usage.questionsAsked === 0);
    setAiQuestions(usage.questionsAsked > 0 ? usage.questionsAsked : DEMO_AI_QUESTIONS);
    setLastUsedAt(usage.lastUsedAt);
    setAiActivity(loadActivity().filter(a => a.type === "ai"));
    setMounted(true);
  }, [router]);

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · AI Usage</p>
          <h2 className="text-4xl font-bold mt-2">AI Usage</h2>
          <p className="mt-3 text-purple-100">Monitor how learners are using the AI Companion across the platform.</p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-3xl font-bold text-purple-600">{aiQuestions}</p>
            <p className="text-slate-500 text-sm mt-1">Total AI Questions</p>
            {usingDemo && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-lg font-bold text-slate-900">{lastUsedAt ? timeAgo(lastUsedAt) : "No activity yet"}</p>
            <p className="text-slate-500 text-sm mt-1">Last Used</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-green-600">98%</p><p className="text-slate-500 text-sm mt-1">Success Rate <span className="text-[10px] font-bold uppercase text-amber-600">demo</span></p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-blue-600">1.4s</p><p className="text-slate-500 text-sm mt-1">Avg Response Time <span className="text-[10px] font-bold uppercase text-amber-600">demo</span></p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Usage by Feature</h3>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>
            </div>
            <div className="mt-6 space-y-4">
              {DEMO_FEATURE_BREAKDOWN.map(f => (
                <div key={f.feature}>
                  <div className="flex justify-between text-sm"><p>{f.feature}</p><p>{f.pct}%</p></div>
                  <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                    <div className="bg-purple-600 h-3 rounded-full" style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">AI System Status</h3>
            <div className="mt-6 space-y-4">
              {[
                ["AI Provider", "Demo / OpenAI Ready"],
                ["Response Language Support", "6 Languages"],
                ["Voice Reader Integration", "Enabled"],
                ["Fallback Mode", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-3">
                  <span>{label}</span><span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <h3 className="text-2xl font-bold">Recent AI Activity</h3>
          {aiActivity.length === 0 ? (
            <p className="mt-4 text-slate-500">No AI-related admin activity logged yet.</p>
          ) : (
            <div className="mt-6 space-y-1">
              {aiActivity.map((a, i) => (
                <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== aiActivity.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <span className="text-lg">🤖</span>
                  <span className="flex-1 text-slate-700">{a.message}</span>
                  <span className="text-slate-400 text-sm flex-shrink-0">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
