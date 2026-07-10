"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  loadUploadQueue, saveUploadQueue, usingDemoUploadQueue,
  loadBookOverrides, saveBookOverrides, logActivity, newId,
  type UploadQueueItem, type AdminBookOverride,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";

// Turns "marathi-science-textbook.pdf" into "Marathi Science Textbook" —
// only used as a starting guess; the admin can still rename it via Book
// Management after approving.
function titleGuessFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const titled = base.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled || "Untitled Upload";
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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
      // The real uploaded file (if this item came from a real upload,
      // not a legacy/demo queue item) — this is what makes the resulting
      // book actually openable everywhere the public catalog is read,
      // instead of a metadata-only shell.
      pdfDataUrl: item.pdfDataUrl, pages: item.pages,
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

  // Reads a REAL PDF chosen by the admin — a data: URL (so it can be
  // reopened later, same technique app/read.tsx already uses for its
  // "Read with AI Tutor" upload path) plus its real page count via
  // pdf.js. Nothing here touches Book Management's own separate
  // mock-upload UI.
  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadError("Please choose a PDF file.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });

      let pages = 1;
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument(dataUrl).promise;
        pages = doc.numPages;
      } catch {
        // Page count is a nice-to-have; a corrupt/odd PDF can still be
        // queued and approved with a page count of 1.
      }

      const item: UploadQueueItem = {
        id: newId("up"), fileName: file.name, bookTitleGuess: titleGuessFromFileName(file.name),
        status: "Ready for Review", submittedAt: Date.now(), pdfDataUrl: dataUrl, pages,
      };
      saveUploadQueue([item, ...queue]);
      logActivity("upload", `${item.fileName} uploaded and queued for review`);
      refresh();
    } catch {
      setUploadError("Could not read this PDF. Please try a different file.");
    } finally {
      setUploading(false);
    }
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const processing = queue.filter(q => q.status === "Processing").length;
  const readyForReview = queue.filter(q => q.status === "Ready for Review").length;
  const approved = queue.filter(q => q.status === "Approved").length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge="Admin · Upload Queue"
          title="Upload & Processing Queue"
          subtitle="Review incoming uploads, approve them into the catalog, or reject them."
          homeLabel="Library"
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total in Queue" value={queue.length} badge={usingDemo ? "demo" : undefined} />
          <StatCard label="Processing" value={processing} valueClassName="text-blue-600" />
          <StatCard label="Ready for Review" value={readyForReview} valueClassName="text-yellow-600" />
          <StatCard label="Approved" value={approved} valueClassName="text-green-600" />
        </div>

        <InfoCard className="mt-8">
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <p className="text-slate-500">
              Upload a real PDF — once approved in this queue, it becomes an actual readable book across the site (homepage, library, AI Tutor, Read).
            </p>
            <label className="mt-6 inline-block cursor-pointer">
              <span className={`inline-block rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/25 transition ${uploading ? "opacity-60" : "hover:bg-orange-700"}`}>
                {uploading ? "Reading PDF…" : "Choose PDF to Upload"}
              </span>
              <input type="file" accept="application/pdf" onChange={handleFileSelected} disabled={uploading} className="hidden" />
            </label>
            {uploadError && <p className="mt-3 text-xs font-semibold text-red-600">{uploadError}</p>}
          </div>
        </InfoCard>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 mt-6 overflow-hidden overflow-x-auto">
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
