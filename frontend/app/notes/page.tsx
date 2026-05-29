"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const notes = [
  {
    title: "Artificial Intelligence",
    type: "AI Summary",
    date: "Today",
  },
  {
    title: "Machine Learning",
    type: "Revision Notes",
    date: "Yesterday",
  },
  {
    title: "Cyber Security",
    type: "Flashcards",
    date: "2 Days Ago",
  },
];

export default function NotesPage() {
  const [savedNotes, setSavedNotes] = useState<string[]>([]);

  useEffect(() => {
    const notes = localStorage.getItem("aiSavedNotes");
  
    if (notes) {
      setSavedNotes(JSON.parse(notes));
    }
  }, []); 
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link
          href="/"
          className="text-blue-600 font-semibold"
        >
          ← Back to Library
        </Link>

        <div className="mt-8 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">
            Smart Notes
          </h1>

          <p className="mt-4 text-lg text-emerald-100 max-w-3xl">
            AI-generated summaries, revision notes, flashcards,
            highlights, and personal learning notes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-3xl font-bold">
              24
            </h2>

            <p className="text-slate-500 mt-2">
              Saved Notes
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-3xl font-bold">
              12
            </h2>

            <p className="text-slate-500 mt-2">
              AI Summaries
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-3xl font-bold">
              86%
            </h2>

            <p className="text-slate-500 mt-2">
              Revision Completion
            </p>
          </div>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-6">
            Recent Notes
          </h2>

          <div className="space-y-5">
  {savedNotes.length === 0 ? (
    <div className="bg-white rounded-3xl p-6 shadow-lg">
      <p className="text-slate-500">
        No saved notes yet. Open AI Reader and save important points.
      </p>
    </div>
  ) : (
    savedNotes.map((note, index) => (
      <div
        key={index}
        className="bg-white rounded-3xl p-6 shadow-lg"
      >
        <h3 className="font-bold text-xl">
          Saved Note {index + 1}
        </h3>

        <p className="text-slate-600 mt-3 leading-7">
          {note}
        </p>
      </div>
    ))
  )}
</div>
        </section>

        <section className="mt-12">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              Quick Actions
            </h2>

            <div className="flex flex-wrap gap-4 mt-6">
              <Link
                href="/reader"
                className="bg-blue-600 text-white px-6 py-3 rounded-xl"
              >
                Open AI Tutor
              </Link>

              <button className="bg-slate-100 px-6 py-3 rounded-xl">
                Export Notes
              </button>

              <button className="bg-slate-100 px-6 py-3 rounded-xl">
                Generate Flashcards
              </button>

              <button className="bg-slate-100 px-6 py-3 rounded-xl">
                Create Revision Sheet
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}