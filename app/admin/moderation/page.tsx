"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type ModerationStatus = "Pending" | "Approved" | "Rejected";

interface ModerationItem {
  id: number;
  type: "Book" | "Comment" | "Upload" | "Report";
  title: string;
  submittedBy: string;
  reason: string;
  flaggedAt: string;
  priority: "High" | "Medium" | "Low";
  status: ModerationStatus;
}

const mockItems: ModerationItem[] = [
  { id: 1, type: "Upload", title: "Unknown_Document_Scan.pdf", submittedBy: "anonymous_user_412", reason: "No metadata, suspected pirated content", flaggedAt: "Today, 11:42 AM", priority: "High", status: "Pending" },
  { id: 2, type: "Book", title: "Cyber Security Basics", submittedBy: "librarian_2", reason: "Metadata mismatch — author name inconsistency", flaggedAt: "Today, 10:15 AM", priority: "Medium", status: "Pending" },
  { id: 3, type: "Comment", title: "Comment on AI Fundamentals", submittedBy: "user_8821", reason: "Reported as spam by 3 users", flaggedAt: "Today, 09:30 AM", priority: "Low", status: "Pending" },
  { id: 4, type: "Book", title: "Indian History Archive", submittedBy: "researcher_4", reason: "Language tagging incorrect — marked English, content is Hindi", flaggedAt: "Yesterday, 4:00 PM", priority: "Medium", status: "Pending" },
  { id: 5, type: "Report", title: "Marathi Science Textbook", submittedBy: "teacher_101", reason: "OCR quality too low — text unreadable in 40% of pages", flaggedAt: "Yesterday, 2:22 PM", priority: "High", status: "Approved" },
  { id: 6, type: "Upload", title: "AI_Research_Preprint.pdf", submittedBy: "researcher_7", reason: "Duplicate of existing indexed document", flaggedAt: "2 days ago", priority: "Low", status: "Rejected" },
];

const priorityStyle: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-slate-100 text-slate-500",
};

const typeIcon: Record<string, string> = {
  Book: "📚", Comment: "💬", Upload: "⬆️", Report: "🚩",
};

export default function ModerationPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();
  const [items, setItems] = useState(mockItems);
  const [filter, setFilter] = useState<ModerationStatus | "All">("All");

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") router.push("/admin-login");
  }, [router]);

  const update = (id: number, status: ModerationStatus) => {
    setItems(i => i.map(item => item.id === id ? { ...item, status } : item));
  };

  const filtered = filter === "All" ? items : items.filter(i => i.status === filter);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Moderation</p>
          <h2 className="text-4xl font-bold mt-2">Content Moderation</h2>
          <p className="mt-3 text-slate-300">Review flagged uploads, content reports, and metadata issues. Approve or reject submissions.</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            [items.filter(i => i.status === "Pending").length, "Pending Review", "text-yellow-600"],
            [items.filter(i => i.priority === "High" && i.status === "Pending").length, "High Priority", "text-red-600"],
            [items.filter(i => i.status === "Approved").length, "Approved", "text-green-600"],
            [items.filter(i => i.status === "Rejected").length, "Rejected", "text-slate-500"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="bg-white rounded-2xl p-2 shadow mt-6 inline-flex gap-1">
          {(["All", "Pending", "Approved", "Rejected"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-4">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl p-6 shadow flex items-start gap-5">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl shrink-0">
                {typeIcon[item.type]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-800">{item.title}</p>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{item.type}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${priorityStyle[item.priority]}`}>{item.priority} Priority</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">🚩 {item.reason}</p>
                <p className="text-xs text-slate-400 mt-1">Submitted by <span className="font-medium">{item.submittedBy}</span> · {item.flaggedAt}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.status === "Pending" ? (
                  <>
                    <button
                      onClick={() => update(item.id, "Approved")}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => update(item.id, "Rejected")}
                      className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-xl text-sm font-semibold transition"
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${item.status === "Approved" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {item.status}
                    </span>
                    <button
                      onClick={() => update(item.id, "Pending")}
                      className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400">
              No {filter.toLowerCase()} items.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
