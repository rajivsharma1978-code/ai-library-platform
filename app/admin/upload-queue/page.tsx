"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

type UploadStatus = "Processing" | "Extracting" | "Completed" | "Failed" | "Queued";

interface QueueItem {
  id: number;
  filename: string;
  format: string;
  size: string;
  language: string;
  status: UploadStatus;
  progress: number;
  submittedAt: string;
  submittedBy: string;
}

const mockQueue: QueueItem[] = [
  { id: 1, filename: "AI_Fundamentals_2024.pdf", format: "PDF", size: "12.4 MB", language: "English", status: "Processing", progress: 65, submittedAt: "Today, 10:32 AM", submittedBy: "admin" },
  { id: 2, filename: "Hindi_Science_Grade10.pdf", format: "PDF", size: "8.1 MB", language: "Hindi", status: "Extracting", progress: 40, submittedAt: "Today, 10:15 AM", submittedBy: "librarian_1" },
  { id: 3, filename: "Tamil_Literature_Vol2.epub", format: "EPUB", size: "3.2 MB", language: "Tamil", status: "Queued", progress: 0, submittedAt: "Today, 09:55 AM", submittedBy: "admin" },
  { id: 4, filename: "Cyber_Security_Handbook.pdf", format: "PDF", size: "22.7 MB", language: "English", status: "Completed", progress: 100, submittedAt: "Today, 09:10 AM", submittedBy: "librarian_2" },
  { id: 5, filename: "Bengali_Poetry_Collection.pdf", format: "PDF", size: "5.8 MB", language: "Bengali", status: "Failed", progress: 0, submittedAt: "Today, 08:45 AM", submittedBy: "admin" },
  { id: 6, filename: "Deep_Learning_Research.pdf", format: "PDF", size: "18.3 MB", language: "English", status: "Completed", progress: 100, submittedAt: "Yesterday, 04:22 PM", submittedBy: "librarian_1" },
];

const statusStyle: Record<UploadStatus, string> = {
  Processing: "bg-blue-100 text-blue-700",
  Extracting: "bg-purple-100 text-purple-700",
  Completed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
  Queued: "bg-slate-100 text-slate-600",
};

const progressColor: Record<UploadStatus, string> = {
  Processing: "bg-blue-500",
  Extracting: "bg-purple-500",
  Completed: "bg-green-500",
  Failed: "bg-red-400",
  Queued: "bg-slate-300",
};

export default function UploadQueuePage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState(mockQueue);

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
    }
  }, [router]);

  const retryItem = (id: number) => {
    setQueue((q) => q.map((item) => item.id === id ? { ...item, status: "Queued" as UploadStatus, progress: 0 } : item));
  };

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-violet-700 to-purple-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Upload Queue</p>
          <h2 className="text-4xl font-bold mt-2">Upload Queue</h2>
          <p className="mt-3 text-purple-100">Manage incoming content — PDF, EPUB, and scanned documents.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mt-6">
          {[
            [queue.filter(q => q.status === "Queued").length, "Queued", "text-slate-600"],
            [queue.filter(q => q.status === "Processing").length, "Processing", "text-blue-600"],
            [queue.filter(q => q.status === "Extracting").length, "Extracting", "text-purple-600"],
            [queue.filter(q => q.status === "Completed").length, "Completed", "text-green-600"],
            [queue.filter(q => q.status === "Failed").length, "Failed", "text-red-600"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); }}
          className={`mt-6 border-3 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${
            dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
          }`}
        >
          <div className="text-5xl mb-4">📁</div>
          <p className="text-xl font-semibold text-slate-700">Drop files here to upload</p>
          <p className="text-slate-400 mt-2 text-sm">Supports PDF, EPUB, DJVU, and scanned documents (OCR auto-enabled)</p>
          <div className="mt-6 flex justify-center gap-4">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition">
              Choose Files
            </button>
            <button className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200 transition">
              Bulk Import via URL
            </button>
          </div>
          <div className="mt-6 flex justify-center gap-6 text-sm text-slate-500">
            <span>✅ AI text extraction</span>
            <span>✅ Metadata detection</span>
            <span>✅ Language detection</span>
            <span>✅ OCR pipeline</span>
          </div>
        </div>

        {/* Queue list */}
        <div className="bg-white rounded-3xl shadow mt-6 overflow-hidden">
          <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
            <h3 className="text-xl font-bold">Processing Queue</h3>
            <button
              onClick={() => setQueue(queue.filter(q => q.status !== "Completed"))}
              className="text-sm text-slate-500 hover:text-red-600 transition"
            >
              Clear Completed
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {queue.map((item) => (
              <div key={item.id} className="px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-lg">
                      {item.format === "PDF" ? "📄" : "📖"}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{item.filename}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.size} · {item.language} · {item.submittedAt} · by {item.submittedBy}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusStyle[item.status]}`}>
                      {item.status}
                    </span>
                    {item.status === "Failed" && (
                      <button
                        onClick={() => retryItem(item.id)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
                {item.status !== "Queued" && item.status !== "Failed" && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{item.status === "Completed" ? "Completed" : "In progress..."}</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full">
                      <div
                        className={`h-2 rounded-full transition-all ${progressColor[item.status]}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
