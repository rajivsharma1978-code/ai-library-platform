"use client";

import Link from "next/link";
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

export default function NotesPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ndl_ai_notes");
    if (saved) setNotes(JSON.parse(saved));
  }, []);

  const filteredNotes = notes.filter((note) =>
    `${note.bookTitle} ${note.chapter || ""} ${note.text}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const deleteNote = (id: string) => {
    const updated = notes.filter((note) => note.id !== id);
    setNotes(updated);
    localStorage.setItem("ndl_ai_notes", JSON.stringify(updated));
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Notes</h1>
            <p className="text-slate-600">
              Notes saved from your books and AI reading sessions.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            Home
          </Link>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes by book, chapter, or text..."
          className="mb-6 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none focus:border-slate-400"
        />

        {filteredNotes.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">
              No notes found
            </h2>
            <p className="mt-2 text-slate-500">
              Save notes while reading books. They will appear here book-wise.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {note.bookTitle}
                    </h2>
                    {note.chapter && (
                      <p className="text-sm text-slate-500">{note.chapter}</p>
                    )}
                  </div>

                  <button
                    onClick={() => deleteNote(note.id)}
                    className="rounded-xl bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>

                <p className="whitespace-pre-line text-slate-700">
                  {note.text}
                </p>

                <p className="mt-4 text-xs text-slate-400">
                  Saved on {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}