"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import {
  loadBookOverrides, loadActivity, loadAIUsage, buildDisplayBooks,
  type AdminActivityEntry, type ActivityType,
} from "@/components/admin/adminData";

const DEMO_USERS_COUNT = 128;
const DEMO_AI_QUESTIONS = 24;

const DEMO_ACTIVITY: AdminActivityEntry[] = [
  { id: "demo-1", type: "upload",     message: "Chandrayaan 3: Tiranga Flies on the Moon uploaded and indexed", timestamp: Date.now() - 1000 * 60 * 40 },
  { id: "demo-2", type: "edit",       message: "Nalanda: The Untold Story metadata updated",                     timestamp: Date.now() - 1000 * 60 * 60 * 3 },
  { id: "demo-3", type: "ai",        message: "AI Tutor answered 12 student questions today",                   timestamp: Date.now() - 1000 * 60 * 60 * 5 },
  { id: "demo-4", type: "moderation", message: "Quantum Computing flagged for language tagging review",         timestamp: Date.now() - 1000 * 60 * 60 * 20 },
  { id: "demo-5", type: "add",        message: "New demo book draft created",                                    timestamp: Date.now() - 1000 * 60 * 60 * 30 },
];

const ACTIVITY_ICON: Record<ActivityType, string> = {
  add: "➕", edit: "✏️", delete: "🗑️", upload: "⬆️", ai: "🤖", moderation: "🛡️",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);

  useEffect(() => {
    const access = localStorage.getItem("ndlAdminAccess");
    if (access !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    setMounted(true);
  }, [router]);

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const overrides = loadBookOverrides();
  const displayBooks = buildDisplayBooks(directorBooks as any[], overrides);
  const totalBooks = displayBooks.length;
  const publishedBooks = displayBooks.filter(b => b.status === "Published").length;
  const draftBooks = displayBooks.filter(b => b.status === "Draft").length;
  const uploadQueueCount = displayBooks.filter(b => b.status === "Pending" || b.status === "Under Review").length;
  const uniqueLanguages = new Set(displayBooks.map(b => b.language)).size;

  const aiUsage = loadAIUsage();
  const aiQuestions = aiUsage.questionsAsked > 0 ? aiUsage.questionsAsked : DEMO_AI_QUESTIONS;
  const usingDemoAI = aiUsage.questionsAsked === 0;

  const realActivity = loadActivity();
  const usingDemoActivity = realActivity.length === 0;
  const activity = (usingDemoActivity ? DEMO_ACTIVITY : realActivity).slice(0, 8);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin Control Center</p>
          <h2 className="text-5xl font-bold mt-3">Manage AI-Powered Digital Library</h2>
          <p className="mt-4 text-blue-100">
            Upload content, manage metadata, monitor AI usage, and track activity across the platform.
          </p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        {/* 1. Dashboard overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
          {[
            [String(totalBooks), "Total Books"],
            [String(publishedBooks), "Published"],
            [String(draftBooks), "Draft"],
            [String(DEMO_USERS_COUNT), "Users"],
            [String(aiQuestions), "AI Questions"],
            [String(uniqueLanguages), "Languages"],
            [String(uploadQueueCount), "Upload Queue"],
            [String(activity.length), "Recent Activity"],
          ].map(([value, label]) => (
            <div key={label} className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-4xl font-bold text-slate-900">{value}</p>
              <p className="text-slate-500 mt-2">{label}</p>
            </div>
          ))}
        </div>

        {/* 4. Quick actions */}
        <div className="mt-8">
          <h3 className="text-lg font-black text-slate-800 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Link href="/admin/book-management?action=add" className="rounded-2xl bg-blue-600 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-blue-700">
              ➕ Add Book
            </Link>
            <Link href="/admin/users" className="rounded-2xl bg-slate-900 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              👥 Manage Users
            </Link>
            <Link href="/admin/ai-usage" className="rounded-2xl bg-slate-900 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              🤖 View AI Usage
            </Link>
            <Link href="/admin/languages" className="rounded-2xl bg-slate-900 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              🌐 Language Settings
            </Link>
            <Link href="/admin/upload-queue" className="rounded-2xl bg-slate-900 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              ⬆️ Upload Queue
            </Link>
          </div>
        </div>

        {/* 3. Admin Activity */}
        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold">Recent Activity</h3>
            {usingDemoActivity && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>
            )}
          </div>
          <div className="mt-6 space-y-1">
            {activity.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== activity.length - 1 ? "border-b border-slate-100" : ""}`}>
                <span className="text-lg">{ACTIVITY_ICON[a.type] ?? "•"}</span>
                <span className="flex-1 text-slate-700">{a.message}</span>
                <span className="text-slate-400 text-sm flex-shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">AI System Status</h3>
            <div className="mt-6 space-y-4">
              {[
                ["AI Provider", "Demo / OpenAI Ready"],
                ["PDF Extraction", "Enabled"],
                ["Multilingual AI", "Enabled"],
                ["Voice Reader", "Enabled"],
                ["Fallback Mode", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-3">
                  <span>{label}</span>
                  <span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">Language Coverage</h3>
            <div className="mt-6 space-y-4">
              {Array.from(new Set(displayBooks.map(b => b.language))).map(lang => {
                const count = displayBooks.filter(b => b.language === lang).length;
                const pct = Math.round((count / Math.max(1, totalBooks)) * 100);
                return (
                  <div key={lang}>
                    <div className="flex justify-between text-sm">
                      <p>{lang}</p>
                      <p>{count} book{count === 1 ? "" : "s"} · {pct}%</p>
                    </div>
                    <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                      <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
