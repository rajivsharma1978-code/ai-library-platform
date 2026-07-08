"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  loadUploadQueue, saveUploadQueue, usingDemoUploadQueue,
  loadBookOverrides, saveBookOverrides, logActivity, newId,
  type UploadQueueItem, type AdminBookOverride,
} from "@/components/admin/adminData";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  Processing: "bg-blue-100 text-blue-700",
  "Ready for Review": "bg-yellow-100 text-yellow-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export default function AdminUploadQueuePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);

  function refresh() {
    setQueue(loadUploadQueue());
    setUsingDemo(usingDemoUploadQueue());
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

  // Approving turns the queue item into a real (custom) book, in Draft
  // status pending final publish from Book Management — a small but
  // meaningful connection between the two pages rather than the action
  // just being cosmetic.
  function approve(item: UploadQueueItem) {
    const next = queue.map(q => q.id === item.id ? { ...q, status: "Approved" as const } : q);
    saveUploadQueue(next);

    const overrides = loadBookOverrides();
    const bookOverride: AdminBookOverride = {
      id: newId("custom"), title: item.bookTitleGuess, author: "", language: "English",
      category: "General", status: "Draft", format: "PDF", pdfFileName: item.fileName,
      isCustom: true, createdAt: Date.now(), updatedAt: Date.now(),
    };
    saveBookOverrides([...overrides, bookOverride]);
    logActivity("upload", `"${item.bookTitleGuess}" approved from upload queue and added as a draft book`);
    refresh();
  }

  function reject(item: UploadQueueItem) {
    const next = queue.map(q => q.id === item.id ? { ...q, status: "Rejected" as const } : q);
    saveUploadQueue(next);
    logActivity("upload", `"${item.bookTitleGuess}" rejected from upload queue`);
    refresh();
  }

  function removeItem(item: UploadQueueItem) {
    saveUploadQueue(queue.filter(q => q.id !== item.id));
    refresh();
  }

  function simulateUpload() {
    const item: UploadQueueItem = {
      id: newId("up"), fileName: `demo-upload-${queue.length + 1}.pdf`,
      bookTitleGuess: `Demo Upload ${queue.length + 1}`, status: "Processing", submittedAt: Date.now(),
    };
    saveUploadQueue([item, ...queue]);
    logActivity("upload", `${item.fileName} submitted to the upload queue`);
    refresh();
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const processing = queue.filter(q => q.status === "Processing").length;
  const readyForReview = queue.filter(q => q.status === "Ready for Review").length;
  const approved = queue.filter(q => q.status === "Approved").length;

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Upload Queue</p>
          <h2 className="text-4xl font-bold mt-2">Upload & Processing Queue</h2>
          <p className="mt-3 text-orange-100">Review incoming uploads, approve them into the catalog, or reject them.</p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-3xl font-bold text-slate-900">{queue.length}</p>
            <p className="text-slate-500 text-sm mt-1">Total in Queue</p>
            {usingDemo && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo</span>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-blue-600">{processing}</p><p className="text-slate-500 text-sm mt-1">Processing</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-yellow-600">{readyForReview}</p><p className="text-slate-500 text-sm mt-1">Ready for Review</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-green-600">{approved}</p><p className="text-slate-500 text-sm mt-1">Approved</p></div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <p className="text-slate-500">Upload PDF / EPUB / scanned documents (demo)</p>
            <button onClick={simulateUpload} className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700">
              Simulate New Upload
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{["File", "Detected Title", "Status", "Submitted", "Actions"].map(h => (
                <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {queue.map(item => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 text-slate-600">{item.fileName}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{item.bookTitleGuess}</td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[item.status]}`}>{item.status}</span></td>
                  <td className="px-6 py-4 text-slate-500">{timeAgo(item.submittedAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      {(item.status === "Processing" || item.status === "Ready for Review") && (
                        <>
                          <button onClick={() => approve(item)} className="text-green-600 hover:underline text-xs font-semibold">Approve</button>
                          <button onClick={() => reject(item)} className="text-red-500 hover:underline text-xs font-semibold">Reject</button>
                        </>
                      )}
                      {(item.status === "Approved" || item.status === "Rejected") && (
                        <button onClick={() => removeItem(item)} className="text-slate-400 hover:underline text-xs font-semibold">Dismiss</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length === 0 && <p className="text-center text-slate-400 py-12">The upload queue is empty.</p>}
        </div>
      </section>
    </main>
  );
}
