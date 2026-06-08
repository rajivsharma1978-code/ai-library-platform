"use client";

import { useEffect, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type Note = {
  id: string;
  bookTitle: string;
  chapter?: string;
  text: string;
  createdAt: string;
};

export default function RevisionPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [notes, setNotes] = useState<Note[]>([]);
  const [revisionText, setRevisionText] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("ndl_ai_notes");

    if (saved) {
      const parsed = JSON.parse(saved);
      setNotes(parsed);

      const combined = parsed
        .map(
          (note: Note) =>
            `Book: ${note.bookTitle}\nChapter: ${note.chapter}\n${note.text}`
        )
        .join("\n\n");

      setRevisionText(combined);
    }
  }, []);
  async function generateRevisionSummary() {
    if (!revisionText.trim()) {
      setAiSummary("No notes available for revision.");
      return;
    }
  
    setLoading(true);
    setAiSummary("");
  
    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question:
            "Create a clear exam-style revision summary from these notes. Include important points, simple explanation, and quick recall bullets.",
          book: "Saved Notes",
          chapter: "AI Revision Center",
          content: revisionText,
        }),
      });
      const oldAnalytics = JSON.parse(
        localStorage.getItem("ndl_ai_analytics") || "{}"
      );
      
      localStorage.setItem(
        "ndl_ai_analytics",
        JSON.stringify({
          ...oldAnalytics,
          revisionSummariesGenerated:
            (oldAnalytics.revisionSummariesGenerated || 0) + 1,
          lastRevisionGeneratedAt: new Date().toISOString(),
        })
      );
      const data = await response.json();
      setAiSummary(
        data.answer ||
          data.error ||
          JSON.stringify(data, null, 2) ||
          "No summary generated."
      );
    } catch {
      setAiSummary("Something went wrong while generating revision summary.");
    } finally {
      setLoading(false);
    }
  }
  function speakRevision() {
    const textToSpeak = aiSummary || revisionText;
  
    if (!textToSpeak.trim()) {
      alert("No revision content available to read aloud.");
      return;
    }
  
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
  
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  
  function stopSpeaking() {
    window.speechSynthesis.cancel();
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
  <div>
    <h1 className="text-4xl font-bold">
      AI Revision Center
    </h1>

    <p className="text-slate-600 mt-2">
      Review all notes collected during reading.
    </p>
  </div>

  <a
    href="/"
    className="rounded-xl bg-black px-4 py-2 text-white"
  >
    ← Home
  </a>
</div>

        <p className="text-slate-600 mb-6">
          Review all notes collected during reading.
        </p>

        <div className="rounded-3xl bg-white p-6 shadow">
          <h2 className="font-bold text-xl mb-4">
            Revision Material
          </h2>
          <button
  onClick={generateRevisionSummary}
  disabled={loading}
  className="mb-4 rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
>
  {loading ? "Generating..." : "Generate AI Revision Summary"}
</button>
<div className="mt-3 flex gap-3">
  <button
    onClick={speakRevision}
    className="rounded-xl bg-blue-600 px-4 py-2 text-white"
  >
    🔊 Read Aloud
  </button>

  <button
    onClick={stopSpeaking}
    className="rounded-xl bg-red-600 px-4 py-2 text-white"
  >
    Stop Voice
  </button>
</div>
          {notes.length === 0 ? (
            <p>No notes available yet.</p>
          ) : (
            <textarea
              value={revisionText}
              readOnly
              className="w-full h-[500px] rounded-2xl border p-4"
            />
          )}
               </div>

{aiSummary && (
  <div className="mt-6 rounded-3xl bg-white p-6 shadow">
    <h2 className="mb-4 text-xl font-bold">AI Revision Summary</h2>
    <div className="whitespace-pre-line text-slate-700">
      {aiSummary}
    </div>
  </div>
)}
</div>
</main>
  );
}