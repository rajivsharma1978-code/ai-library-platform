"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// ── Unified reading experience ──────────────────────────────────────────
// This page's ONLY job now is: accept a PDF, store it somewhere Premium
// Reader can load it from, and hand off. It does NOT extract text, run
// OCR, or offer its own reading/AI UI anymore — Premium Reader already
// has all of that (real text-layer extraction with an OCR fallback for
// scanned pages, AI Companion, Study Workspace, highlights, notes,
// bookmarks, Read Aloud, translation, quiz, revision), so duplicating any
// of it here would be exactly the "old AI workflow" this was built to
// retire.
//
// Storage: a base64 data URL in sessionStorage. This is the one thing
// that survives BOTH a client-side route change and a full page reload
// within the same tab — a blob: URL (what this page used to hand off
// with) does not: it's tied to the Document that created it and stops
// working the moment that document unloads, which a real navigation to
// /reader-premium would trigger. "Temporary" per the brief: sessionStorage
// clears when the tab closes, unlike localStorage.
const UPLOAD_KEYS = {
  data: "ndl_uploaded_pdf_data",
  name: "ndl_uploaded_pdf_name",
  pages: "ndl_uploaded_pdf_pages",
  id: "ndl_uploaded_pdf_id",
} as const;

type Status = "idle" | "reading" | "error";

export default function ReadPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setStatus("error");
      setErrorMessage(isEn ? "Please choose a PDF file." : "कृपया एक पीडीएफ फ़ाइल चुनें।");
      return;
    }

    setFileName(file.name);
    setStatus("reading");
    setErrorMessage("");

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });

      // Page count only — Premium Reader extracts everything else
      // (real or OCR text) itself once it loads the document.
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjsLib.getDocument(dataUrl).promise;
      const pageCount = doc.numPages;

      // A fresh id per upload — keeps this upload's highlights/notes/
      // bookmarks (keyed by bookId in the same ndl_highlights/ndl_notes/
      // ndl_bookmarks localStorage Study Workspace already uses) from
      // colliding with any earlier upload in the same browser.
      const uploadId = `uploaded-${Date.now()}`;

      window.sessionStorage.setItem(UPLOAD_KEYS.data, dataUrl);
      window.sessionStorage.setItem(UPLOAD_KEYS.name, file.name);
      window.sessionStorage.setItem(UPLOAD_KEYS.pages, String(pageCount));
      window.sessionStorage.setItem(UPLOAD_KEYS.id, uploadId);

      router.push("/reader-premium?source=upload");
    } catch (err) {
      console.error("[ReadPage] Failed to prepare uploaded PDF:", err);
      setStatus("error");
      setErrorMessage(
        isEn
          ? "Could not read this PDF. Please try a different file."
          : "यह पीडीएफ पढ़ी नहीं जा सकी। कृपया कोई अन्य फ़ाइल आज़माएं।"
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
            ← {isEn ? "Home" : "होम"}
          </Link>
          <Link href="/ai-tutor" className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300">
            {isEn ? "AI Tutor" : "एआई ट्यूटर"}
          </Link>
        </div>

        <div className="rounded-3xl bg-white p-10 text-center shadow-lg ring-1 ring-black/5">
          <div className="text-4xl">📤</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            {isEn ? "Upload Your Own PDF" : "अपनी पीडीएफ अपलोड करें"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isEn
              ? "Your document opens directly in Premium Reader — the same AI Companion, Study Workspace, highlights, notes, bookmarks, Read Aloud, and quizzes you get with every library book."
              : "आपका दस्तावेज़ सीधे प्रीमियम रीडर में खुलता है — वही एआई कंपेनियन, स्टडी वर्कस्पेस, हाइलाइट्स, नोट्स, बुकमार्क, रीड अलाउड और क्विज़ जो हर लाइब्रेरी किताब के साथ मिलते हैं।"}
          </p>

          <label className="mt-6 inline-block cursor-pointer rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white shadow hover:bg-blue-700">
            {status === "reading"
              ? (isEn ? "Preparing…" : "तैयार हो रहा है…")
              : (isEn ? "Choose PDF" : "पीडीएफ चुनें")}
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              disabled={status === "reading"}
              className="hidden"
            />
          </label>

          {fileName && status !== "error" && (
            <p className="mt-4 truncate text-xs text-slate-400">📄 {fileName}</p>
          )}
          {status === "error" && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">
              {errorMessage}
            </p>
          )}

          <p className="mt-6 text-[11px] text-slate-400">
            {isEn
              ? "Stored temporarily for this browser session only — not saved permanently."
              : "यह केवल इस ब्राउज़र सत्र के लिए अस्थायी रूप से संग्रहीत है — स्थायी रूप से सहेजा नहीं गया है।"}
          </p>
        </div>
      </div>
    </main>
  );
}
