"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  loadModeration, saveModeration, usingDemoModeration, logActivity,
  type ModerationFlag, type ModerationSeverity,
} from "@/components/admin/adminData";

const SEVERITY_COLORS: Record<ModerationSeverity, string> = {
  Low: "bg-slate-200 text-slate-600",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-red-100 text-red-700",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminModerationPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [filter, setFilter] = useState<"All" | "Open" | "Resolved">("Open");

  function refresh() {
    setFlags(loadModeration());
    setUsingDemo(usingDemoModeration());
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

  function resolve(flag: ModerationFlag) {
    saveModeration(flags.map(f => f.id === flag.id ? { ...f, status: "Resolved" as const } : f));
    logActivity("moderation", `Flag on "${flag.subject}" marked resolved`);
    refresh();
  }
  function reopen(flag: ModerationFlag) {
    saveModeration(flags.map(f => f.id === flag.id ? { ...f, status: "Open" as const } : f));
    logActivity("moderation", `Flag on "${flag.subject}" reopened`);
    refresh();
  }
  function dismiss(flag: ModerationFlag) {
    saveModeration(flags.filter(f => f.id !== flag.id));
    logActivity("moderation", `Flag on "${flag.subject}" dismissed`);
    refresh();
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const open = flags.filter(f => f.status === "Open").length;
  const resolved = flags.filter(f => f.status === "Resolved").length;
  const highSeverity = flags.filter(f => f.severity === "High" && f.status === "Open").length;
  const visible = flags.filter(f => filter === "All" || f.status === filter);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-red-700 to-orange-600 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Moderation</p>
          <h2 className="text-4xl font-bold mt-2">Moderation Alerts</h2>
          <p className="mt-3 text-red-100">Review and resolve flagged content across the platform.</p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-3xl font-bold text-slate-900">{flags.length}</p>
            <p className="text-slate-500 text-sm mt-1">Total Flags</p>
            {usingDemo && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-yellow-600">{open}</p><p className="text-slate-500 text-sm mt-1">Open</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-green-600">{resolved}</p><p className="text-slate-500 text-sm mt-1">Resolved</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-red-600">{highSeverity}</p><p className="text-slate-500 text-sm mt-1">High Severity (Open)</p></div>
        </div>

        <div className="mt-6 flex gap-2">
          {(["Open", "Resolved", "All"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow"}`}>
              {f}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{["Subject", "Reason", "Severity", "Status", "Flagged", "Actions"].map(h => (
                <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {visible.map(f => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{f.subject}</td>
                  <td className="px-6 py-4 text-slate-600">{f.reason}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${SEVERITY_COLORS[f.severity]}`}>{f.severity}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${f.status === "Open" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{timeAgo(f.flaggedAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      {f.status === "Open" ? (
                        <button onClick={() => resolve(f)} className="text-green-600 hover:underline text-xs font-semibold">Resolve</button>
                      ) : (
                        <button onClick={() => reopen(f)} className="text-blue-600 hover:underline text-xs font-semibold">Reopen</button>
                      )}
                      <button onClick={() => dismiss(f)} className="text-red-500 hover:underline text-xs font-semibold">Dismiss</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="text-center text-slate-400 py-12">No flags to show.</p>}
        </div>
      </section>
    </main>
  );
}
