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
  const book =
  searchParams.get("book") ||
  searchParams.get("pdf") ||
  localStorage.getItem("uploadedPdfName") ||
  "Artificial Intelligence";



const currentPage = searchParams.get("page") || "1";
  const [question, setQuestion] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [activeChapter, setActiveChapter] = useState("Introduction");
  const [isThinking, setIsThinking] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      type: "ai",
      text: `Welcome! I am your AI Tutor for ${book}.
  
  Currently analyzing page ${currentPage}.
  
  Ask me to summarize, explain, quiz, translate, or simplify this content.`,
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
          text:
            data.answer ||
            `AI response for ${activeChapter}: ${chapters[activeChapter].join(" ")}`,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: `Demo AI answer: ${questionText}. This platform can explain, summarize, quiz, translate, and personalize learning from this book.`,
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

    setMessages((prev) => [
      ...prev,
      { type: "user", text: `Explain this: ${selectedText}` },
    ]);

    addAIMessage(`Explain this selected text in simple language: ${selectedText}`);

    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }

  function multilingualResponse(language: string) {
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        text: `Explain ${activeChapter} in ${language}`,
      },
      {
        type: "ai",
        text: `Demo ${language} explanation: ${activeChapter} can be explained in a simple regional-language format so students, elderly learners, and rural users can understand the concept easily. In production, this will connect to multilingual AI translation and tutoring.`,
      },
    ]);
  }

  function saveCurrentNote() {
    setSavedNotes((prev) => [
      ...prev,
      `${activeChapter}: ${chapters[activeChapter][0]}`,
    ]);
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
          ? "h-screen flex bg-slate-950 text-white overflow-hidden"
          : "h-screen flex bg-slate-100 text-slate-900 overflow-hidden"
      }
    >
      <aside className="w-72 bg-slate-950 text-white p-6 overflow-auto border-r border-white/10">
        <Link href="/" className="text-blue-400 font-semibold">
          ← Back to Library
        </Link>

        <h2 className="text-3xl font-bold mt-8">AI Reader</h2>

        <p className="text-slate-400 mt-2 text-sm">
          Smart multilingual learning workspace.
        </p>

        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Chapters
          </p>

          <div className="mt-4 space-y-3">
            {Object.keys(chapters).map((chapter) => (
              <button
                key={chapter}
                onClick={() => setActiveChapter(chapter)}
                className={
                  activeChapter === chapter
                    ? "w-full text-left bg-blue-600 p-4 rounded-2xl shadow-lg"
                    : "w-full text-left bg-slate-900 hover:bg-slate-800 p-4 rounded-2xl transition"
                }
              >
                {chapter}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 bg-slate-900 p-5 rounded-3xl">
          <p className="text-sm font-bold">Learning Progress</p>

          <div className="w-full bg-slate-700 h-3 rounded-full mt-4">
            <div className="bg-blue-500 h-3 rounded-full w-[58%]" />
          </div>

          <p className="text-xs text-slate-400 mt-3">
            58% of this book completed
          </p>
        </div>
      </aside>

      <section
        onMouseUp={() => {
          const text = window.getSelection()?.toString().trim() || "";
          setSelectedText(text);
        }}
        className="flex-1 overflow-auto p-8"
      >
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 p-10 text-white shadow-2xl">
            <p className="uppercase text-sm tracking-widest opacity-80">
              AI-powered learning mode
            </p>

            <h1 className="text-5xl font-bold mt-3">{book}</h1>

            <p className="mt-4 text-blue-100 max-w-3xl">
              Ask questions, summarize chapters, translate into Indian languages,
              generate quizzes, save notes, and learn in a personalized way.
            </p>

            <div className="flex gap-3 mt-6 flex-wrap">
              <button
                onClick={() =>
                  addAIMessage(`Summarize ${activeChapter} in simple points.`)
                }
                className="bg-white text-black px-5 py-3 rounded-xl font-semibold"
              >
                Summarize
              </button>

              <button
                onClick={() =>
                  addAIMessage(`Explain ${activeChapter} for a beginner.`)
                }
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold"
              >
                Explain Simply
              </button>

              <Link
                href={`/read?book=${encodeURIComponent(book)}`}
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold"
              >
                Classic Read Mode
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">AI Summary</p>
              <h3 className="text-xl font-bold mt-2">Key Takeaways</h3>
              <p className="text-slate-600 mt-3 text-sm leading-6">
                This chapter explains how AI-enabled digital libraries can turn
                passive reading into guided, personalized learning.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">Multilingual AI</p>
              <h3 className="text-xl font-bold mt-2">Explain in Indian Languages</h3>

              <div className="flex flex-wrap gap-2 mt-4">
                {["Hindi", "Tamil", "Bengali", "Marathi", "Telugu", "Kannada"].map(
                  (language) => (
                    <button
                      key={language}
                      onClick={() => multilingualResponse(language)}
                      className="bg-blue-100 text-blue-700 px-3 py-2 rounded-full text-xs hover:bg-blue-600 hover:text-white"
                    >
                      {language}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">Practice</p>
              <h3 className="text-xl font-bold mt-2">Quick Quiz</h3>
              <p className="text-sm text-slate-600 mt-3">
                What is the main benefit of AI in digital libraries?
              </p>

              <button
                onClick={() => addAIMessage(`Create a quiz from ${activeChapter}.`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl mt-4"
              >
                Generate Quiz
              </button>
            </div>
          </div>

          <article
            className={
              darkMode
                ? "mt-8 bg-slate-900 rounded-3xl p-10 shadow-xl text-slate-100"
                : "mt-8 bg-white rounded-3xl p-10 shadow-xl text-slate-800"
            }
          >
            <h2 className="text-4xl font-bold">{activeChapter}</h2>

            {selectedText && (
              <button
                onClick={askAboutSelectedText}
                className="mt-6 bg-blue-600 text-white px-5 py-3 rounded-xl shadow"
              >
                Ask AI about selected text
              </button>
            )}

            <div className="mt-8 space-y-8 text-lg leading-9">
              {chapters[activeChapter].map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-10 bg-yellow-100 text-black border-l-4 border-yellow-500 p-6 rounded-2xl">
              <p className="font-bold">Highlighted by AI</p>

              <p className="mt-2">
                “AI-first libraries combine reading, tutoring, notes, quizzes,
                and revision into one experience.”
              </p>

              <button
                onClick={saveCurrentNote}
                className="mt-4 bg-black text-white px-4 py-2 rounded-xl"
              >
                Save as Note
              </button>
            </div>
          </article>
        </div>
      </section>

      <aside className="w-[32%] bg-black text-white p-5 flex flex-col h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">AI Tutor</h2>
            <p className="text-xs text-gray-400">Context: {activeChapter}</p>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="bg-white text-black w-10 h-10 rounded-full"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          {[
            ["Summarize", `Summarize ${activeChapter}.`],
            ["Explain", `Explain ${activeChapter} simply.`],
            ["Quiz", `Create quiz for ${activeChapter}.`],
            ["Flashcards", `Create flashcards for ${activeChapter}.`],
            ["Hindi", `Explain ${activeChapter} in Hindi.`],
            ["Voice", `Prepare a voice-friendly explanation for ${activeChapter}.`],
          ].map(([label, prompt]) => (
            <button
              key={label}
              onClick={() => addAIMessage(prompt)}
              className="bg-slate-900 hover:bg-blue-600 p-3 rounded-2xl text-sm"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3 flex-1 overflow-auto pr-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.type === "user"
                  ? "bg-blue-600 ml-8 p-4 rounded-2xl text-sm"
                  : "bg-slate-900 mr-8 p-4 rounded-2xl text-sm"
              }
            >
              {message.text}
            </div>
          ))}

          {isThinking && (
            <div className="bg-slate-900 p-4 rounded-2xl text-sm text-gray-300">
              AI is thinking...
            </div>
          )}
        </div>

        <div className="mt-4 bg-slate-900 rounded-3xl p-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Saved Notes</h3>

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
                <div key={index} className="bg-black p-2 rounded-xl text-xs">
                  {note}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Ask AI anything..."
            className="flex-1 rounded-xl px-4 py-3 bg-white text-black outline-none text-sm"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-700 px-5 rounded-xl text-sm"
          >
            Send
          </button>
        </div>
      </aside>

      <button
        onClick={() =>
          setMessages((prev) => [
            ...prev,
            {
              type: "ai",
              text: "Floating AI Assistant opened. Ask me anything about this book, chapter, summary, quiz, translation, or learning path.",
            },
          ])
        }
        className="fixed bottom-8 right-8 bg-blue-600 text-white w-16 h-16 rounded-full shadow-2xl text-3xl hover:scale-110 transition"
      >
        🤖
      </button>
    </main>
  );
}