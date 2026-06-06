"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

const aiModels = [
  { name: "GPT-4o Mini", provider: "OpenAI", requests: 98200, tokens: "142M", cost: "$284.10", status: "Active", latency: "310ms" },
  { name: "Claude Sonnet", provider: "Anthropic", requests: 41000, tokens: "68M", cost: "$136.00", status: "Active", latency: "420ms" },
  { name: "Ollama (Local)", provider: "Self-hosted", requests: 12300, tokens: "18M", cost: "$0.00", status: "Active", latency: "890ms" },
  { name: "GPT-3.5 Turbo", provider: "OpenAI", requests: 6800, tokens: "10M", cost: "$10.00", status: "Fallback", latency: "220ms" },
];

const usageByFeature = [
  { feature: "Book Q&A", icon: "💬", queries: 64200, pct: 88 },
  { feature: "AI Summaries", icon: "📝", queries: 38100, pct: 72 },
  { feature: "Quiz Generation", icon: "🧠", queries: 22800, pct: 55 },
  { feature: "Multilingual Explain", icon: "🌐", queries: 18400, pct: 48 },
  { feature: "Voice Read (TTS)", icon: "🔊", queries: 12000, pct: 36 },
  { feature: "Revision Notes", icon: "📋", queries: 9400, pct: 28 },
  { feature: "Flashcard Gen", icon: "🃏", queries: 5100, pct: 18 },
];

const recentAlerts = [
  { level: "info", msg: "GPT-4o Mini response time spiked to 980ms at 14:22 IST", time: "1h ago" },
  { level: "warn", msg: "Token usage 78% of monthly budget reached", time: "3h ago" },
  { level: "info", msg: "Claude Sonnet fallback triggered 42 times today", time: "5h ago" },
  { level: "ok", msg: "AI pipeline health check passed — all systems nominal", time: "6h ago" },
];

const alertStyle: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-700",
  warn: "bg-yellow-50 border-yellow-200 text-yellow-700",
  ok: "bg-green-50 border-green-200 text-green-700",
};
const alertIcon: Record<string, string> = { info: "ℹ️", warn: "⚠️", ok: "✅" };

export default function AIUsagePage() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") router.push("/admin-login");
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-cyan-700 to-blue-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · AI Usage</p>
          <h2 className="text-4xl font-bold mt-2">AI Usage Monitor</h2>
          <p className="mt-3 text-cyan-100">Track AI model consumption, token usage, cost, latency, and feature breakdowns in real time.</p>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            ["185K", "Queries Today", "text-blue-600"],
            ["238M", "Tokens This Month", "text-purple-600"],
            ["$430.10", "AI Cost This Month", "text-red-600"],
            ["96.4%", "Uptime (30 days)", "text-green-600"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-8 mt-8">
          {/* Model breakdown */}
          <div className="bg-white rounded-3xl p-8 shadow">
            <h3 className="text-xl font-bold mb-6">Model Breakdown</h3>
            <div className="space-y-4">
              {aiModels.map((m) => (
                <div key={m.name} className="border border-slate-100 rounded-2xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.provider}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.status === "Active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {m.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-slate-400 text-xs">Requests</p>
                      <p className="font-semibold">{m.requests.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Tokens</p>
                      <p className="font-semibold">{m.tokens}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Cost / Latency</p>
                      <p className="font-semibold">{m.cost} · {m.latency}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature usage */}
          <div className="bg-white rounded-3xl p-8 shadow">
            <h3 className="text-xl font-bold mb-6">Usage by Feature</h3>
            <div className="space-y-4">
              {usageByFeature.map((f) => (
                <div key={f.feature}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700">{f.icon} {f.feature}</span>
                    <span className="text-slate-500">{f.queries.toLocaleString()} queries</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full">
                    <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-3xl p-8 shadow mt-8">
          <h3 className="text-xl font-bold mb-5">Recent Alerts & Events</h3>
          <div className="space-y-3">
            {recentAlerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 border rounded-xl p-4 text-sm ${alertStyle[a.level]}`}>
                <span>{alertIcon[a.level]}</span>
                <p className="flex-1">{a.msg}</p>
                <span className="text-xs opacity-60 shrink-0">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Config */}
        <div className="bg-white rounded-3xl p-8 shadow mt-8">
          <h3 className="text-xl font-bold mb-5">AI Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Primary Model", "gpt-4o-mini"],
              ["Fallback Model", "gpt-3.5-turbo"],
              ["Monthly Token Budget", "250M tokens"],
              ["Rate Limit (per user)", "50 req / hour"],
              ["PDF Context Window", "8,000 tokens"],
              ["Demo Mode Fallback", "Enabled"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between items-center border border-slate-100 rounded-2xl px-5 py-3">
                <span className="text-slate-600 text-sm">{label}</span>
                <span className="font-semibold text-slate-800 text-sm">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
