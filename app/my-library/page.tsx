"use client";

import { useEffect, useState } from "react";
function getCover(bookTitle: string) {
    if (bookTitle === "Artificial Intelligence") {
      return "https://covers.openlibrary.org/b/id/10523338-L.jpg";
    }
  
    if (bookTitle === "Machine Learning") {
      return "https://covers.openlibrary.org/b/id/8231856-L.jpg";
    }
  
    if (bookTitle === "Data Science") {
      return "https://covers.openlibrary.org/b/id/240726-L.jpg";
    }
  
    if (bookTitle === "Robotics") {
      return "https://covers.openlibrary.org/b/id/5546156-L.jpg";
    }
  
    return "https://covers.openlibrary.org/b/id/8235116-L.jpg";
  }
export default function MyLibraryPage() {
  const [notesCount, setNotesCount] = useState(0);
  const [quizCount, setQuizCount] = useState(0);
  const [revisionCount, setRevisionCount] = useState(0);
  const [savedBooks, setSavedBooks] = useState<string[]>([]);
  useEffect(() => {
    const notes = JSON.parse(
      localStorage.getItem("ndl_ai_notes") || "[]"
    );

    const analytics = JSON.parse(
      localStorage.getItem("ndl_ai_analytics") || "{}"
    );

    setNotesCount(notes.length);
    setQuizCount(analytics.quizzesGenerated || 0);
    setRevisionCount(
      analytics.revisionSummariesGenerated || 0
    );
    const books = JSON.parse(
        localStorage.getItem("ndl_my_library") || "[]"
      );
      
      setSavedBooks(books); 
  }, []);
  function removeBook(bookTitle: string) {
    const updatedBooks = savedBooks.filter((book) => book !== bookTitle);
    setSavedBooks(updatedBooks);
    localStorage.setItem("ndl_my_library", JSON.stringify(updatedBooks));
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">
              My Library
            </h1>

            <p className="mt-2 text-slate-600">
              Personal learning dashboard.
            </p>
          </div>

          <a
            href="/"
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            ← Home
          </a>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">Saved Notes</p>
            <h2 className="mt-2 text-4xl font-bold">
              {notesCount}
            </h2>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Revision Sessions
            </p>
            <h2 className="mt-2 text-4xl font-bold">
              {revisionCount}
            </h2>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Quizzes Generated
            </p>
            <h2 className="mt-2 text-4xl font-bold">
              {quizCount}
            </h2>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 shadow">
  <h2 className="mb-6 text-2xl font-bold">
    📚 My Bookshelf
  </h2>

  {savedBooks.length === 0 ? (
    <p className="text-slate-600">
      No books saved yet. Add books from the book page.
    </p>
  ) : (
    <div className="grid gap-4 md:grid-cols-3">
      {savedBooks.map((book) => (
        <div
          key={book}
          className="rounded-2xl border p-4 hover:shadow-lg"
        >
          <img
  src={getCover(book)}
  alt={book}
  className="h-56 w-full rounded-xl object-cover shadow"
/>

          <h3 className="mt-4 font-bold">
            {book}
          </h3>

          <div className="mt-4 flex gap-2">
            <a
              href={`/read?book=${encodeURIComponent(book)}`}
              className="rounded-xl bg-black px-3 py-2 text-white text-sm"
            >
              Read
            </a>

            <a
              href={`/reader?book=${encodeURIComponent(book)}`}
              className="rounded-xl bg-blue-600 px-3 py-2 text-white text-sm"
            >
              Ask AI
            </a>
            <button
  onClick={() => removeBook(book)}
  className="rounded-xl bg-red-600 px-3 py-2 text-white text-sm"
>
  Remove
</button>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
      </div>
    </main>
  );
}