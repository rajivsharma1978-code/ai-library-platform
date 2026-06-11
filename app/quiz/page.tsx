"use client";

import { useEffect, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type Quiz = {
  question: string;
  options: string[];
  answer: string;
};

export default function QuizPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [notesText, setNotesText] = useState("");
  const [quizText, setQuizText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ndl_ai_notes");
    if (!saved) return;
    const notes = JSON.parse(saved);
    const combined = notes
      .map((note: any) => `${note.chapter}: ${note.text}`)
      .join("\n\n");
    setNotesText(combined);
  }, []);

  async function generateQuiz() {
    if (!notesText.trim()) {
      setQuizText(t.searchNoResults);
      return;
    }

    setLoading(true);
    setQuizText("");

    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Create 5 multiple-choice quiz questions from these notes. Give 4 options for each question and clearly mention the correct answer.",
          book: "Saved Notes",
          chapter: "AI Quiz Generator",
          content: notesText,
        }),
      });

      const data = await response.json();
      const finalQuiz = data.answer || t.searchNoResults;
      setQuizText(finalQuiz);

      const oldAnalytics = JSON.parse(localStorage.getItem("ndl_ai_analytics") || "{}");
      localStorage.setItem("ndl_ai_analytics", JSON.stringify({
        ...oldAnalytics,
        quizzesGenerated: (oldAnalytics.quizzesGenerated || 0) + 1,
        lastQuizGeneratedAt: new Date().toISOString(),
      }));
    } catch {
      setQuizText(t.chatError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">{t.aiF3Title}</h1>
            <p className="mt-2 text-slate-600">{t.aiF3Desc}</p>
          </div>
          <a href="/" className="rounded-xl bg-black px-4 py-2 text-white">
            ← {t.navLibrary}
          </a>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold">{t.aiSummaryBtn}</h2>

          <textarea
            value={notesText}
            readOnly
            className="h-64 w-full rounded-2xl border p-4"
          />

          <button
            onClick={generateQuiz}
            disabled={loading}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? `${t.thinking}...` : t.aiF3Title}
          </button>
        </div>

        {quizText && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-bold">{t.aiF3Title}</h2>
            <div className="whitespace-pre-line text-slate-700">{quizText}</div>
          </div>
        )}
      </div>
    </main>
  );
}