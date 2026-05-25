"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

const chapters: Record<string, string[]> = {
  Introduction: [
    "This chapter introduces the foundation of intelligent learning systems.",
    "Students can understand the subject through summaries, examples, and AI-guided explanations.",
    "AI-first libraries combine reading, tutoring, notes, quizzes, and revision into one experience.",
  ],
  "Core Concepts": [
    "Core concepts explain the building blocks behind the subject.",
    "The goal is to simplify complex ideas using structured learning and examples.",
    "AI can convert difficult paragraphs into simple language for every learner.",
  ],
  Applications: [
    "Applications show how the subject is used in education, research, and industry.",
    "Students can connect theory with real-world use cases.",
    "AI helps learners discover practical examples faster.",
  ],
  "Case Studies": [
    "Case studies help students understand how concepts work in real situations.",
    "They improve critical thinking and practical understanding.",
    "AI can summarize long case studies into key insights.",
  ],
  "Future Scope": [
    "Future scope explains how the subject may evolve over time.",
    "AI-powered platforms will make learning more personalized and accessible.",
    "Digital libraries can become intelligent national learning platforms.",
  ],
  "Research Topics": [
    "Research topics help advanced learners explore deeper questions.",
    "AI can recommend papers, generate summaries, and explain academic concepts.",
    "This creates a stronger bridge between students, books, and research.",
  ],
};

type Message = {
  type: "user" | "ai";
  text: string;
};

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const book = searchParams.get("book") || "Artificial Intelligence";

  const [question, setQuestion] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [activeChapter, setActiveChapter] = useState("Introduction");
  const [uploadedPdf, setUploadedPdf] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      type: "ai",
      text: `Welcome! I am your AI Tutor for ${book}. Ask me to summarize, explain, quiz, or simplify any concept.`,
    },
  ]);

  async function addAIMessage(questionText: string) {
    setIsThinking(true);
  
    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: questionText,
          book,
          chapter: activeChapter,
          content: chapters[activeChapter].join(" "),
        }),
      });
  
      const data = await response.json();
  
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: data.answer,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: "Failed to connect with AI.",
        },
      ]);
    }
  
    setIsThinking(false);
  }

  function sendMessage() {
    if (!question.trim()) return;

    const userQuestion = question;

    setMessages((prev) => [...prev, { type: "user", text: userQuestion }]);
    setQuestion("");

    addAIMessage(userQuestion);
  }

  function askAboutSelectedText() {
    if (!selectedText.trim()) return;

    const textToExplain = selectedText;

    setMessages((prev) => [
      ...prev,
      { type: "user", text: `Explain this: ${textToExplain}` },
    ]);

    addAIMessage(`Explain this selected text in simple language: ${textToExplain}`);

    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }

  function exportNotes() {
    const notesText = savedNotes.length
      ? savedNotes.join("\n\n")
      : "No saved notes yet.";

    const blob = new Blob([notesText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${book}-notes.txt`;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main
      className={
        darkMode
          ? "h-screen flex bg-black text-white overflow-hidden"
          : "h-screen flex bg-gray-100 overflow-hidden"
      }
    >
      <section className="w-[70%] flex">
        <aside className="w-64 bg-zinc-900 text-white p-6 overflow-auto">
          <h2 className="text-2xl font-bold">Chapters</h2>

          <div className="mt-8 space-y-4">
            {Object.keys(chapters).map((chapter) => (
              <button
                key={chapter}
                onClick={() => setActiveChapter(chapter)}
                className={
                  activeChapter === chapter
                    ? "w-full text-left bg-blue-600 cursor-pointer p-4 rounded-xl shadow-lg"
                    : "w-full text-left bg-zinc-800 hover:bg-blue-600 transition cursor-pointer p-4 rounded-xl"
                }
              >
                {chapter}
              </button>
            ))}
          </div>

          <div className="mt-10 bg-zinc-800 p-4 rounded-2xl">
            <p className="font-bold">Import Study Material</p>

            <label className="mt-4 block bg-blue-600 hover:bg-blue-700 text-white text-center px-4 py-3 rounded-xl cursor-pointer text-sm font-semibold">
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadedPdf(file.name);
                }}
                className="hidden"
              />
            </label>

            {uploadedPdf && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-green-400 break-words">
                  Imported: {uploadedPdf}
                </p>

                <button
                  onClick={() =>
                    addAIMessage(
                      `PDF Summary: I have analyzed ${uploadedPdf}. This document appears ready for AI summary, Q&A, notes, flashcards, and quizzes.`
                    )
                  }
                  className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold"
                >
                  Analyze PDF with AI
                </button>
              </div>
            )}
          </div>
        </aside>

        <section
          onMouseUp={() => {
            const text = window.getSelection()?.toString().trim() || "";
            setSelectedText(text);
          }}
          className={
            darkMode
              ? "flex-1 bg-zinc-950 text-white p-10 overflow-auto"
              : "flex-1 bg-white text-black p-10 overflow-auto"
          }
        >
          <div className="max-w-4xl mx-auto">
            <Link
              href="/"
              className="inline-block mb-8 text-blue-600 font-semibold"
            >
              ← Back to Library
            </Link>

            <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-purple-700 p-8 text-white shadow-xl">
              <p className="text-sm uppercase tracking-widest opacity-80">
                AI Reader
              </p>

              <h1 className="text-5xl font-bold mt-3">{book}</h1>

              <p className="mt-4 text-blue-100">
                Read, ask, summarize, save notes, import PDFs, and learn faster.
              </p>
            </div>

            <h2 className="text-3xl font-bold mt-10">{activeChapter}</h2>

            {selectedText && (
              <button
                onClick={askAboutSelectedText}
                className="mt-6 bg-blue-600 text-white px-5 py-3 rounded-xl shadow hover:bg-blue-700"
              >
                Ask AI about selected text
              </button>
            )}

            <div
              className={
                darkMode
                  ? "mt-8 space-y-8 text-lg leading-9 text-gray-200"
                  : "mt-8 space-y-8 text-lg leading-9 text-gray-800"
              }
            >
              {chapters[activeChapter].map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}

              <div className="bg-yellow-100 text-black border-l-4 border-yellow-500 p-6 rounded-xl shadow">
                <p className="font-semibold">Highlighted by AI:</p>

                <p className="mt-2">
                  “Personalized learning can help every student understand
                  content at their own pace.”
                </p>

                <button
                  onClick={() =>
                    setSavedNotes((prev) => [
                      ...prev,
                      `${activeChapter}: Personalized learning can help every student understand content at their own pace.`,
                    ])
                  }
                  className="mt-4 bg-black text-white px-4 py-2 rounded-xl"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>

      <aside className="w-[30%] bg-black text-white p-5 flex flex-col h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">AI Tutor</h2>
            <p className="text-xs text-gray-400">Context: {activeChapter}</p>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="bg-white text-black w-9 h-9 rounded-full text-lg"
            title="Toggle dark mode"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={() =>
              addAIMessage(
                `Summary of ${activeChapter}: ${chapters[activeChapter].join(" ")}`
              )
            }
            className="bg-blue-600 hover:bg-blue-700 p-2 rounded-xl text-sm"
          >
            Summarize
          </button>

          <button
            onClick={() =>
              addAIMessage(
                `Simple Explanation: ${activeChapter} explains the topic in a learner-friendly way using examples and clear concepts.`
              )
            }
            className="bg-purple-600 hover:bg-purple-700 p-2 rounded-xl text-sm"
          >
            Explain Simply
          </button>

          <button
            onClick={() =>
              addAIMessage(
                `Quiz for ${activeChapter}:\n1. What is the main idea?\n2. Why is it useful?\n3. Give one real-world example.`
              )
            }
            className="bg-green-600 hover:bg-green-700 p-2 rounded-xl text-sm"
          >
            Create Quiz
          </button>

          <button
            onClick={() =>
              addAIMessage(
                `Flashcards for ${activeChapter}:\n• Concept\n• Meaning\n• Example\n• Application\n• Revision Point`
              )
            }
            className="bg-pink-600 hover:bg-pink-700 p-2 rounded-xl text-sm"
          >
            Flashcards
          </button>
        </div>

        <div className="mt-3 bg-zinc-900 p-3 rounded-2xl">
          <p className="text-xs text-gray-400">Reading Progress</p>

          <div className="w-full bg-zinc-700 h-2 rounded-full mt-2">
            <div className="bg-blue-500 h-2 rounded-full w-[55%]"></div>
          </div>
        </div>

        <div className="mt-4 space-y-3 flex-1 overflow-auto pr-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.type === "user"
                  ? "bg-blue-600 p-3 rounded-2xl shadow-lg text-sm"
                  : "bg-zinc-800 p-3 rounded-2xl shadow-lg text-sm"
              }
            >
              {message.text}
            </div>
          ))}

          {isThinking && (
            <div className="bg-zinc-800 p-3 rounded-2xl text-sm text-gray-300">
              AI is thinking...
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Saved Notes</h3>

            <div className="flex gap-2">
              <button
                onClick={exportNotes}
                className="bg-white text-black px-3 py-1 rounded-lg text-xs"
              >
                Export
              </button>

              <button
                onClick={() => setSavedNotes([])}
                className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-24 overflow-auto">
            {savedNotes.length === 0 ? (
              <p className="text-xs text-gray-500">No saved notes yet.</p>
            ) : (
              savedNotes.map((note, index) => (
                <div key={index} className="bg-zinc-800 p-2 rounded-xl text-xs">
                  {note}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Ask AI anything..."
            className="flex-1 rounded-xl px-3 py-2 bg-white text-black border border-gray-300 outline-none text-sm"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-700 px-4 rounded-xl text-sm"
          >
            Send
          </button>
        </div>
      </aside>
    </main>
  );
}