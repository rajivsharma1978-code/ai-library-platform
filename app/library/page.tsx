"use client";

import Link from "next/link";
import { useEffect, useState } from "react";



const uploadedItems = [
  "Uploaded Biology PDF",
  "Scanned History Notes",
  "Research Paper Draft",
];

function getCover(book: string) {
  if (book === "Artificial Intelligence") return "https://covers.openlibrary.org/b/id/10523338-L.jpg";
  if (book === "Machine Learning") return "https://covers.openlibrary.org/b/id/8231856-L.jpg";
  if (book === "Data Science") return "https://covers.openlibrary.org/b/id/240726-L.jpg";
  return "https://covers.openlibrary.org/b/id/8235116-L.jpg";
}

export default function LibraryPage() {
    const [readingHistory, setReadingHistory] = useState<string[]>([]);
    const [savedBooks, setSavedBooks] = useState<string[]>([]);
    const [bookmarks, setBookmarks] = useState<string[]>([]);
    useEffect(() => {
      const history = localStorage.getItem("readingHistory");
    
      if (history) {
        setReadingHistory(JSON.parse(history));
      }
      const storedBookmarks = localStorage.getItem("aiBookmarks");

if (storedBookmarks) {
  setBookmarks(JSON.parse(storedBookmarks));
}
const storedSavedBooks = localStorage.getItem("savedBooks");

if (storedSavedBooks) {
  setSavedBooks(JSON.parse(storedSavedBooks));
}
    }, []);  
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link href="/" className="text-blue-600 font-semibold">
          ← Back to Home
        </Link>

        <div className="mt-8 bg-gradient-to-r from-slate-900 to-blue-900 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">My Library</h1>

          <p className="mt-4 text-lg text-blue-100 max-w-3xl">
            Your personal learning shelf with saved books, uploaded PDFs,
            AI notes, bookmarks, and continue-reading items.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mt-10">
          {[
            ["12", "Saved Books"],
            ["4", "Uploaded PDFs"],
            ["24", "Saved Notes"],
            ["72%", "Reading Progress"],
          ].map(([value, label]) => (
            <div key={label} className="bg-white rounded-3xl p-8 shadow-lg">
              <h2 className="text-4xl font-bold">{value}</h2>
              <p className="text-slate-500 mt-2">{label}</p>
            </div>
          ))}
        </div>
        <section className="mt-12">
  <h2 className="text-3xl font-bold text-slate-900">
    Recently Opened
  </h2>

  <div className="grid md:grid-cols-4 gap-6 mt-6">
    {readingHistory.length === 0 ? (
      <div className="bg-white rounded-3xl p-6 shadow">
        <p className="text-slate-500">
          No reading history yet.
        </p>
      </div>
    ) : (
      readingHistory.map((book) => (
        <Link
          key={book}
          href={`/book/${encodeURIComponent(book)}`}
          className="bg-white rounded-3xl p-5 shadow hover:-translate-y-1 hover:shadow-xl transition"
        >
          <img
            src={getCover(book)}
            alt={book}
            className="w-full h-60 rounded-2xl object-cover"
          />

          <h3 className="font-bold mt-4 text-slate-900">
            {book}
          </h3>

          <p className="text-sm text-slate-500 mt-2">
            Continue learning
          </p>
        </Link>
      ))
    )}
  </div>
</section>
<section className="mt-12">
  <h2 className="text-3xl font-bold text-slate-900">
    Bookmarks
  </h2>

  <div className="mt-6 space-y-4">
    {bookmarks.length === 0 ? (
      <div className="bg-white rounded-3xl p-6 shadow">
        <p className="text-slate-500">
          No bookmarks yet.
        </p>
      </div>
    ) : (
      bookmarks.map((bookmark, index) => (
        <div
          key={index}
          className="bg-white rounded-3xl p-6 shadow flex justify-between items-center"
        >
          <p className="font-semibold text-slate-900">
            🔖 {bookmark}
          </p>

          <Link
            href="/reader"
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm"
          >
            Open
          </Link>
        </div>
      ))
    )}
  </div>
</section>
        <section className="mt-12">
          <h2 className="text-3xl font-bold text-slate-900">
            Saved Books
          </h2>

          <div className="grid md:grid-cols-4 gap-6 mt-6">
          {savedBooks.length === 0 ? (
  <div className="bg-white rounded-3xl p-6 shadow">
    <p className="text-slate-500">
      No books saved yet.
    </p>
  </div>
) : (
  savedBooks.map((book) => (
              <Link
                key={book}
                href={`/book/${encodeURIComponent(book)}`}
                className="bg-white rounded-3xl p-5 shadow hover:-translate-y-1 hover:shadow-xl transition"
              >
                <img
                  src={getCover(book)}
                  alt={book}
                  className="w-full h-60 rounded-2xl object-cover"
                />

                <h3 className="font-bold mt-4 text-slate-900">
                  {book}
                </h3>

                <p className="text-sm text-slate-500 mt-2">
                  AI Ready • Notes • Quiz
                </p>
              </Link>
            ))
        )}
          </div>
        </section>

        <section className="mt-12 grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold">Uploaded Learning Files</h2>

            <div className="mt-6 space-y-4">
              {uploadedItems.map((item) => (
                <div
                  key={item}
                  className="border rounded-2xl p-5 flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold">{item}</p>
                    <p className="text-sm text-slate-500">
                      PDF / scanned document
                    </p>
                  </div>

                  <Link
                    href="/read"
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-700 to-purple-700 rounded-3xl p-8 text-white shadow-lg">
            <h2 className="text-2xl font-bold">
              Continue Learning
            </h2>

            <p className="mt-4 text-indigo-100 leading-7">
              AI recommends continuing Artificial Intelligence and reviewing weak
              topics from your recent quiz attempts.
            </p>

            <Link
              href="/reader"
              className="inline-block mt-6 bg-white text-black px-5 py-3 rounded-xl"
            >
              Open AI Tutor
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}