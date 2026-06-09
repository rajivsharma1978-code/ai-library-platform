"use client";

import { useState } from "react";
import ReaderLayout from "@/components/reader/ReaderLayout";
import FlipBookStage from "@/components/reader/FlipBookStage";

export default function PremiumReaderPreview() {
  const [readerPage, setReaderPage] = useState(1);

  const book = "NDL AI Premium Flipbook Demo";
  const pdfPages = "120";

  const activeContent =
    "This premium reader is designed for the National Digital Library AI platform. It supports open-book reading, double-page spread, AI explanation, summaries, multilingual learning, quizzes, notes, and future visual understanding of diagrams, maps, charts, and illustrations.";

  return (
    <ReaderLayout
      leftPanel={
        <div>
          <h2 className="text-2xl font-black">Book Info</h2>
          <p className="mt-3 text-sm text-slate-400">
            Chapters, thumbnails, bookmarks, and reading history will appear here.
          </p>
        </div>
      }
      center={
        <FlipBookStage
          book={book}
          readerPage={readerPage}
          pdfPages={pdfPages}
          activeContent={activeContent}
          onPrevious={() => setReaderPage((page) => Math.max(1, page - 2))}
          onNext={() => setReaderPage((page) => Math.min(120, page + 2))}
          onAskAI={(prompt) => alert(prompt)}
          onSaveNote={() => alert("Note saved")}
        />
      }
      rightPanel={
        <div className="flex h-full flex-col p-5">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-2xl font-black">🤖 AI Tutor</h2>
            <p className="mt-1 text-xs font-semibold text-green-400">
              Active beside the book
            </p>
          </div>
      
          <div className="mt-5 flex-1 space-y-4 overflow-auto">
            <div className="rounded-3xl bg-slate-900 p-4 text-sm leading-7 text-slate-200">
              Welcome. Ask anything about the current spread, selected text,
              diagram, image, chapter, or book.
            </div>
      
            <div className="rounded-3xl bg-blue-600 p-4 text-sm leading-7 text-white">
              Example: Explain this page in simple language.
            </div>
      
            <div className="rounded-3xl bg-slate-900 p-4 text-sm leading-7 text-slate-200">
              I can summarize, translate, create quizzes, generate notes,
              explain diagrams, and prepare revision cards.
            </div>
          </div>
      
          <div className="border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Quick Actions
            </p>
      
            <div className="grid grid-cols-2 gap-2">
              {["Summary", "Explain", "Translate", "Quiz", "Flashcards", "Notes"].map(
                (item) => (
                  <button
                    key={item}
                    className="rounded-2xl bg-slate-900 px-3 py-3 text-xs font-bold hover:bg-blue-600"
                  >
                    {item}
                  </button>
                )
              )}
            </div>
      
            <div className="mt-4 flex gap-2">
              <input
                placeholder="Ask AI about this book..."
                className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-black outline-none"
              />
      
              <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">
                Send
              </button>
            </div>
          </div>
        </div>
      }
    />
  );
}