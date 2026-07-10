"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  loadAccessibility, saveAccessibility, usingDemoAccessibility, logActivity,
  type AccessibilityCheckItem, type AccessibilityStatus,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";

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
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const passCount = items.filter(i => i.status === "Pass").length;
  const needsWorkCount = items.filter(i => i.status === "Needs Work").length;
  const notStartedCount = items.filter(i => i.status === "Not Started").length;
  const overallScore = items.length > 0 ? Math.round((passCount / items.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge="Admin · Accessibility"
          title="Accessibility Readiness"
          subtitle="Track accessibility checks across the Reader and AI Companion."
          homeLabel="Library"
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Overall Score" value={`${overallScore}%`} valueClassName="text-green-600" badge={usingDemo ? "demo" : undefined} />
          <StatCard label="Pass" value={passCount} valueClassName="text-green-600" />
          <StatCard label="Needs Work" value={needsWorkCount} valueClassName="text-yellow-600" />
          <StatCard label="Not Started" value={notStartedCount} valueClassName="text-slate-500" />
        </div>

        <InfoCard className="mt-8">
          <h3 className="text-2xl font-black text-slate-950">Accessibility Checklist</h3>
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
        </InfoCard>
      </section>
    </main>
  );
}
