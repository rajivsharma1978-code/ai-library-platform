"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  loadAccessibility, saveAccessibility, usingDemoAccessibility, logActivity,
  type AccessibilityCheckItem, type AccessibilityStatus,
} from "@/components/admin/adminData";

const STATUS_ORDER: AccessibilityStatus[] = ["Not Started", "Needs Work", "Pass"];
const STATUS_COLORS: Record<AccessibilityStatus, string> = {
  Pass: "bg-green-100 text-green-700",
  "Needs Work": "bg-yellow-100 text-yellow-700",
  "Not Started": "bg-slate-200 text-slate-600",
};

export default function AdminAccessibilityPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [items, setItems] = useState<AccessibilityCheckItem[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);

  function refresh() {
    setItems(loadAccessibility());
    setUsingDemo(usingDemoAccessibility());
  }

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    refresh();
    setMounted(true);
  }, [router]);

  function cycleStatus(item: AccessibilityCheckItem) {
    const idx = STATUS_ORDER.indexOf(item.status);
    const nextStatus = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    const next = items.map(i => i.id === item.id ? { ...i, status: nextStatus } : i);
    saveAccessibility(next);
    logActivity("edit", `Accessibility check "${item.label}" set to ${nextStatus}`);
    refresh();
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const passCount = items.filter(i => i.status === "Pass").length;
  const needsWorkCount = items.filter(i => i.status === "Needs Work").length;
  const notStartedCount = items.filter(i => i.status === "Not Started").length;
  const overallScore = items.length > 0 ? Math.round((passCount / items.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Accessibility</p>
          <h2 className="text-4xl font-bold mt-2">Accessibility Readiness</h2>
          <p className="mt-3 text-emerald-100">Track accessibility checks across the Reader and AI Companion.</p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-3xl font-bold text-emerald-600">{overallScore}%</p>
            <p className="text-slate-500 text-sm mt-1">Overall Score</p>
            {usingDemo && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-green-600">{passCount}</p><p className="text-slate-500 text-sm mt-1">Pass</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-yellow-600">{needsWorkCount}</p><p className="text-slate-500 text-sm mt-1">Needs Work</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-slate-500">{notStartedCount}</p><p className="text-slate-500 text-sm mt-1">Not Started</p></div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <h3 className="text-2xl font-bold">Accessibility Checklist</h3>
          <p className="mt-1 text-sm text-slate-500">Click a status pill to cycle it (Not Started → Needs Work → Pass).</p>
          <div className="mt-6 space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-700">{item.label}</span>
                <button
                  onClick={() => cycleStatus(item)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${STATUS_COLORS[item.status]}`}
                >
                  {item.status}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
