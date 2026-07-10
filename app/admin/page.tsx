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
  loadUsers, usingDemoUsers,
  type AdminActivityEntry, type ActivityType,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";

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
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
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

  // Same list Admin → Users manages — Add/Remove there now shows up here
  // too, instead of a number nothing was ever connected to.
  const userCount = loadUsers().length;
  const usingDemoUsersCount = usingDemoUsers();

  const realActivity = loadActivity();
  const usingDemoActivity = realActivity.length === 0;
  const activity = (usingDemoActivity ? DEMO_ACTIVITY : realActivity).slice(0, 8);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge="Admin Control Center"
          title="Manage AI-Powered Digital Library"
          subtitle="Upload content, manage metadata, monitor AI usage, and track activity across the platform."
          homeLabel="Library"
        />

        <InfoCard tone="amber" className="mb-8 py-3 text-sm font-semibold">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </InfoCard>

        {/* 1. Dashboard overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard icon="📚" label="Total Books" value={totalBooks} />
          <StatCard icon="✅" label="Published" value={publishedBooks} />
          <StatCard icon="📝" label="Draft" value={draftBooks} />
          <StatCard icon="👥" label="Users" value={userCount} badge={usingDemoUsersCount ? "demo" : undefined} />
          <StatCard icon="🤖" label="AI Questions" value={aiQuestions} badge={usingDemoAI ? "demo" : undefined} />
          <StatCard icon="🌐" label="Languages" value={uniqueLanguages} />
          <StatCard icon="⬆️" label="Upload Queue" value={uploadQueueCount} />
          <StatCard icon="🕐" label="Recent Activity" value={activity.length} />
        </div>

        {/* 4. Quick actions */}
        <div className="mt-8">
          <h3 className="text-lg font-black text-slate-950 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Link href="/admin/book-management?action=add" className="rounded-2xl bg-orange-600 px-4 py-4 text-center text-sm font-bold text-white shadow-md shadow-orange-500/25 hover:bg-orange-700">
              ➕ Add Book
            </Link>
            <Link href="/admin/users" className="rounded-2xl bg-slate-950 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              👥 Manage Users
            </Link>
            <Link href="/admin/ai-usage" className="rounded-2xl bg-slate-950 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              🤖 View AI Usage
            </Link>
            <Link href="/admin/languages" className="rounded-2xl bg-slate-950 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              🌐 Language Settings
            </Link>
            <Link href="/admin/upload-queue" className="rounded-2xl bg-slate-950 px-4 py-4 text-center text-sm font-bold text-white shadow hover:bg-slate-800">
              ⬆️ Upload Queue
            </Link>
          </div>
        </div>

        {/* 3. Admin Activity */}
        <InfoCard className="mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-950">Recent Activity</h3>
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
        </InfoCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <InfoCard>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-950">AI System Status</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">static</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Fixed configuration flags, not a live health check — there's no backend service to poll in this prototype.</p>
            <div className="mt-6 space-y-4">
              {[
                ["AI Provider", "Demo / OpenAI Ready"],
                ["PDF Extraction", "Enabled"],
                ["Multilingual AI", "Enabled"],
                ["Voice Reader", "Enabled"],
                ["Fallback Mode", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{label}</span>
                  <span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard>
            <h3 className="text-2xl font-black text-slate-950">Language Coverage</h3>
            <div className="mt-6 space-y-4">
              {Array.from(new Set(displayBooks.map(b => b.language))).map(lang => {
                const count = displayBooks.filter(b => b.language === lang).length;
                const pct = Math.round((count / Math.max(1, totalBooks)) * 100);
                return (
                  <div key={lang}>
                    <div className="flex justify-between text-sm text-slate-700">
                      <p>{lang}</p>
                      <p>{count} book{count === 1 ? "" : "s"} · {pct}%</p>
                    </div>
                    <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                      <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </InfoCard>
        </div>
      </section>
    </main>
  );
}
