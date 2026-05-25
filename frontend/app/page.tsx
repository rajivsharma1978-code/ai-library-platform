"use client";

import Link from "next/link";
import { useState } from "react";

const books = [
  "Artificial Intelligence",
  "Machine Learning",
  "Data Science",
  "Robotics",
  "Deep Learning",
  "Python Basics",
  "Quantum Computing",
  "Cloud Architecture",
  "Cyber Security",
];

function getCover(book: string) {
  if (book === "Artificial Intelligence") {
    return "https://covers.openlibrary.org/b/id/10523338-L.jpg";
  }

  if (book === "Machine Learning") {
    return "https://covers.openlibrary.org/b/id/8231856-L.jpg";
  }

  if (book === "Data Science") {
    return "https://covers.openlibrary.org/b/id/240726-L.jpg";
  }

  if (book === "Robotics") {
    return "https://covers.openlibrary.org/b/id/5546156-L.jpg";
  }

  return "https://covers.openlibrary.org/b/id/8235116-L.jpg";
}

export default function Home() {
  const [search, setSearch] = useState("");

  const filteredBooks = books.filter((book) =>
    book.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-b z-50 px-10 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NDL AI</h1>
          <p className="text-xs text-slate-500">
            National Digital Learning Intelligence Platform
          </p>
        </div>

        <div className="flex items-center gap-4">
          <select className="rounded-xl border px-4 py-2 bg-white text-black outline-none">
            <option>English</option>
            <option>Hindi</option>
            <option>Bengali</option>
            <option>Tamil</option>
            <option>Telugu</option>
            <option>Marathi</option>
          </select>

          <button className="bg-black text-white px-5 py-2 rounded-xl">
            Sign In
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 bg-slate-950 text-white p-6 min-h-screen pt-28 fixed left-0 top-0">
          <h2 className="text-3xl font-bold">NDL AI</h2>

          <p className="text-slate-400 mt-2">
            One Library. Infinite Learning.
          </p>

          <div className="mt-10 space-y-4">
            {["📚 Library", "🔍 Explore", "🤖 AI Tutor", "📝 Notes", "📊 Analytics", "🛡️ Admin", "⚙️ Settings"].map(
              (item) => (
                <Link
  key={item}
  href={item.includes("Admin") ? "/admin" : "/"}
  className="block px-4 py-3 rounded-xl hover:bg-white/10 cursor-pointer transition"
>
  {item}
</Link>
              )
            )}
          </div>
        </aside>

        <section className="ml-64 flex-1 p-8 pt-28">
          <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 rounded-3xl p-10 text-white shadow-2xl">
            <div className="inline-block bg-white/15 border border-white/20 px-4 py-2 rounded-full text-sm mb-6">
              Government-ready AI learning infrastructure
            </div>

            <h1 className="text-5xl font-bold max-w-4xl leading-tight">
              One Library. Infinite Learning. Powered by AI.
            </h1>

            <p className="mt-5 text-lg max-w-3xl text-blue-100">
              Search books, import study material, ask AI questions, generate
              notes, create quizzes, and study in your preferred language.
            </p>

            <div className="grid grid-cols-4 gap-4 mt-8 max-w-4xl">
              {[
                ["10M+", "Learning Resources"],
                ["24x7", "AI Tutor"],
                ["6+", "Indian Languages"],
                ["₹0", "Demo Mode"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="bg-white/15 border border-white/20 rounded-2xl p-4"
                >
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-sm text-blue-100">{label}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-8">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search books, authors, topics..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none text-black focus:ring-2 focus:ring-blue-500"
                />

                <button
                  onClick={() => setSearch("")}
                  className="bg-white text-black px-5 rounded-xl"
                >
                  ✕
                </button>
              </div>

              {search && filteredBooks.length > 0 && (
                <div className="absolute bg-white text-black rounded-xl w-full mt-2 shadow-lg max-h-60 overflow-auto z-50">
                  {filteredBooks.slice(0, 5).map((book) => (
                    <div
                      key={book}
                      className="p-4 hover:bg-gray-100 cursor-pointer"
                      onClick={() => setSearch(book)}
                    >
                      📚 {book}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-8 flex-wrap">
            {[
              "AI",
              "Engineering",
              "Science",
              "Humanities",
              "Languages",
              "Competitive Exams",
            ].map((category) => (
              <button
                key={category}
                className="bg-white px-5 py-2 rounded-full shadow hover:bg-blue-600 hover:text-white transition"
              >
                {category}
              </button>
            ))}
          </div>

          <div className="flex items-end justify-between mt-10">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">
                Recommended Learning Resources
              </h2>
              <p className="text-slate-500 mt-2">
                AI-ready books and study material for smart learning.
              </p>
            </div>

            <button className="bg-white px-5 py-2 rounded-xl shadow text-sm">
              View All
            </button>
          </div>

          <div className="grid grid-cols-4 gap-6 mt-6">
            {filteredBooks.map((book) => (
              <Link href={`/book/${encodeURIComponent(book)}`} key={book}>
                <div className="bg-white rounded-2xl p-5 shadow-md cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition duration-300">
                  <img
                    src={getCover(book)}
                    className="w-full h-56 rounded-xl object-cover"
                    alt={book}
                  />

                  <div className="flex items-center justify-between mt-4 gap-3">
                    <h3 className="font-bold text-slate-900">{book}</h3>

                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full whitespace-nowrap">
                      AI Ready
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
                    <p>⭐ 4.8</p>
                    <p>12k learners</p>
                  </div>

                  <div className="mt-4 bg-slate-100 rounded-xl p-3 text-sm text-slate-600">
                    AI Summary • Quiz • Flashcards
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-16">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-3xl font-bold text-slate-900">
        National Learning Insights
      </h2>

      <p className="text-slate-500 mt-2">
        Real-time AI-powered education analytics dashboard
      </p>
    </div>

    <button className="bg-black text-white px-5 py-3 rounded-xl">
      View Full Dashboard
    </button>
  </div>

  <div className="grid grid-cols-4 gap-6 mt-8">
    {[
      ["2.4M", "Active Students"],
      ["185K", "Daily AI Queries"],
      ["96%", "Learning Satisfaction"],
      ["28", "States Connected"],
    ].map(([value, label]) => (
      <div
        key={label}
        className="bg-white rounded-3xl p-6 shadow-lg"
      >
        <p className="text-4xl font-bold text-slate-900">
          {value}
        </p>

        <p className="text-slate-500 mt-2">
          {label}
        </p>
      </div>
    ))}
  </div>

  <div className="grid grid-cols-3 gap-6 mt-8">
    <div className="bg-white rounded-3xl p-6 shadow-lg">
      <h3 className="text-xl font-bold">
        AI Learning Growth
      </h3>

      <div className="mt-6 h-52 rounded-2xl bg-gradient-to-t from-blue-100 to-purple-100 flex items-end gap-4 p-6">
        <div className="bg-blue-600 w-10 h-20 rounded-t-xl"></div>
        <div className="bg-blue-600 w-10 h-28 rounded-t-xl"></div>
        <div className="bg-blue-600 w-10 h-36 rounded-t-xl"></div>
        <div className="bg-blue-600 w-10 h-44 rounded-t-xl"></div>
        <div className="bg-blue-600 w-10 h-52 rounded-t-xl"></div>
      </div>
    </div>

    <div className="bg-white rounded-3xl p-6 shadow-lg">
      <h3 className="text-xl font-bold">
        Top AI Subjects
      </h3>

      <div className="mt-6 space-y-4">
        {[
          ["Artificial Intelligence", "92%"],
          ["Machine Learning", "87%"],
          ["Cyber Security", "81%"],
          ["Cloud Computing", "76%"],
        ].map(([subject, value]) => (
          <div key={subject}>
            <div className="flex justify-between text-sm">
              <p>{subject}</p>
              <p>{value}</p>
            </div>

            <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
              <div
                className="bg-blue-600 h-3 rounded-full"
                style={{ width: value }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="bg-gradient-to-br from-indigo-700 to-purple-700 rounded-3xl p-6 text-white shadow-lg">
      <p className="uppercase text-sm tracking-widest opacity-80">
        AI Recommendation
      </p>

      <h3 className="text-3xl font-bold mt-4">
        Expand AI Learning Access Nationwide
      </h3>

      <p className="mt-4 text-blue-100 leading-7">
        NDL AI can transform public education by combining digital libraries,
        AI tutoring, multilingual learning, analytics, and personalized
        education infrastructure.
      </p>

      <button className="mt-6 bg-white text-black px-5 py-3 rounded-xl font-semibold">
        Generate Ministry Report
      </button>
    </div>
  </div>
</div>
        </section>
      </div>
    </main>
  );
}