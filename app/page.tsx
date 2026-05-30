"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const categories = [
  "All",
  "Science",
  "Technology",
  "Medical",
  "Research",
  "History",
  "Business",
  "AI",
  "Education",
];
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

const bookCategories: Record<string, string> = {
  "Artificial Intelligence": "AI",
  "Machine Learning": "AI",
  "Data Science": "Technology",
  Robotics: "Technology",
  "Deep Learning": "AI",
  "Python Basics": "Education",
  "Quantum Computing": "Science",
  "Cloud Architecture": "Technology",
  "Cyber Security": "Technology",
};

const sections = [
  {
    title: "Trending Now",
    subtitle: "Most-read books across the platform",
    books: ["Artificial Intelligence", "Machine Learning", "Data Science", "Robotics"],
  },
  {
    title: "Continue Reading",
    subtitle: "Pick up where you left off",
    books: ["Python Basics", "Cloud Architecture", "Cyber Security", "Deep Learning"],
  },
  {
    title: "AI Recommended For You",
    subtitle: "Personalized learning paths powered by AI",
    books: ["Quantum Computing", "Artificial Intelligence", "Machine Learning", "Data Science"],
  },
  {
    title: "Research & Journals",
    subtitle: "Academic and research-focused material",
    books: ["Robotics", "Deep Learning", "Quantum Computing", "Cyber Security"],
  },
  {
    title: "Competitive Exams",
    subtitle: "Resources for students and exam preparation",
    books: ["Python Basics", "Data Science", "Machine Learning", "Cloud Architecture"],
  },
];

function getCover(book: string) {
  if (book === "Artificial Intelligence") return "https://covers.openlibrary.org/b/id/10523338-L.jpg";
  if (book === "Machine Learning") return "https://covers.openlibrary.org/b/id/8231856-L.jpg";
  if (book === "Data Science") return "https://covers.openlibrary.org/b/id/240726-L.jpg";
  if (book === "Robotics") return "https://covers.openlibrary.org/b/id/5546156-L.jpg";
  return "https://covers.openlibrary.org/b/id/8235116-L.jpg";
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [readingHistory, setReadingHistory] = useState<string[]>([]);
useEffect(() => {
  const stored = localStorage.getItem("ndlUser");

  if (stored) {
    setUser(JSON.parse(stored));
  }
  const history = localStorage.getItem("readingHistory");

if (history) {
  setReadingHistory(JSON.parse(history));
}
}, []);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const filteredBooks = books.filter((book) => {
    const matchesSearch = book
      .toLowerCase()
      .includes(search.toLowerCase());
  
    const matchesCategory =
      activeCategory === "All" ||
      bookCategories[book] === activeCategory;
  
    return matchesSearch && matchesCategory;
  });
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
          <select className="rounded-xl border px-4 py-2 bg-white text-black">
            <option>English</option>
            <option>Hindi</option>
            <option>Bengali</option>
            <option>Tamil</option>
            <option>Telugu</option>
            <option>Marathi</option>
          </select>

          {user ? (
  <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow">
   <div>
  <p className="font-semibold text-sm">
    {user.name}
  </p>

  <p className="text-xs text-slate-500">
    {user.role}
  </p>

  <button
    onClick={() => {
      localStorage.removeItem("ndlUser");
      window.location.reload();
    }}
    className="text-xs text-red-600 mt-1"
  >
    Logout
  </button>
</div> 
  </div>
) : (
  <Link
    href="/sign-in"
    className="bg-black text-white px-5 py-3 rounded-xl"
  >
    👤 Sign In
  </Link>
)}
        </div>
      </header>

      <div className="flex">
      <aside className="w-64 bg-slate-950 text-white p-4 h-screen pt-20 fixed left-0 top-0 overflow-y-auto">
          <h2 className="text-3xl font-bold">NDL AI</h2>

          <p className="text-slate-400 mt-2">
            One Library. Infinite Learning.
          </p>

          <div className="mt-6 space-y-2">
            {[
  "📚 Library",
  "👤 My Library",
  "🔍 Explore",
  "🤖 AI Tutor",
  "📝 Notes",
  "🧠 AI Revision Center",
  "🎴 Flashcards",
  "🧪 AI Quiz",
  "📊 Analytics",
  "🛡️ Admin",
  "⚙️ Settings",
].map(
              (item) => (
                <Link
                  key={item}
                  href={
                    item.includes("My Library")
  ? "/my-library"
  : item.includes("Library")
  ? "/library"
                      : item.includes("Explore")
                      ? "/explore"
                      : item.includes("AI Tutor")
                      ? "/reader"
                      : item.includes("Notes")
                      ? "/notes"
                      : item.includes("Revision")
? "/revision"
: item.includes("Flashcards")
? "/flashcards"
: item.includes("Quiz")
? "/quiz"
                      : item.includes("Analytics")
                      ? "/analytics"
                      : item.includes("Admin")
                      ? "/admin-login"
                      : "/"
                  }
                  className="block px-4 py-3 rounded-xl hover:bg-white/10 transition"
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
            {user ? `${user.role} Learning Dashboard` : "AI-powered public digital library"}
            </div>

            <h1 className="text-5xl font-bold max-w-5xl leading-tight">
            {user
  ? `Welcome back, ${user.name}`
  : "Discover, Read, Learn and Interact with Books"}
            </h1>

            <p className="mt-5 text-lg max-w-3xl text-blue-100">
            {user
  ? `Your personalized ${user.role} workspace is ready with AI tutor, notes, analytics, reading progress and recommendations.`
  : "A modern national library experience with smart search, classic reading, AI tutoring, multilingual learning, summaries, notes and quizzes."}
            </p>
            <div className="flex gap-4 mt-8 flex-wrap">
  <Link
    href="/read"
    className="bg-white text-black px-6 py-3 rounded-2xl font-semibold shadow"
  >
    Upload / Read PDF
  </Link>

  <Link
    href="/reader"
    className="bg-black/30 border border-white/20 text-white px-6 py-3 rounded-2xl font-semibold"
  >
    Open AI Tutor
  </Link>
</div>
            <div className="relative mt-8 max-w-5xl">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search books, authors, subjects, journals..."
                  className="w-full rounded-2xl px-5 py-4 outline-none text-black focus:ring-4 focus:ring-blue-300"
                />

                <button
                  onClick={() => setSearch("")}
                  className="bg-white text-black px-6 rounded-2xl"
                >
                  ✕
                </button>
              </div>

              {search && filteredBooks.length > 0 && (
                <div className="absolute bg-white text-black rounded-2xl w-full mt-3 shadow-xl max-h-72 overflow-auto z-50">
                  {filteredBooks.map((book) => (
                    <Link
                      href={`/book/${encodeURIComponent(book)}`}
                      key={book}
                      className="block p-4 hover:bg-slate-100"
                    >
                      📚 {book}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4 mt-8 max-w-5xl">
              {[
                ["10M+", "Resources"],
                ["22", "Indian Languages"],
                ["24x7", "AI Tutor"],
                ["500+", "Institutions"],
              ].map(([value, label]) => (
                <div key={label} className="bg-white/15 border border-white/20 rounded-2xl p-4">
                  <p className="text-3xl font-bold">{value}</p>
                  <p className="text-sm text-blue-100">{label}</p>
                </div>
              ))}
            </div>
          </div>
          {user && (
  <div className="mt-8 bg-white/15 border border-white/20 rounded-3xl p-6 max-w-5xl">
    <h2 className="text-2xl font-bold">
      Recommended for {user.role}
    </h2>

    <div className="grid md:grid-cols-3 gap-4 mt-5">
      {(user.role === "Teacher"
        ? ["Lesson Plans", "Classroom Questions", "Student Progress"]
        : user.role === "Researcher"
        ? ["Research Topics", "Academic Summaries", "Citation Support"]
        : user.role === "Senior Learner"
        ? ["Simple Explanations", "Voice Learning", "Daily Life Examples"]
        : ["Continue Reading", "Practice Quizzes", "Revision Notes"]
      ).map((item) => (
        <div
          key={item}
          className="bg-white text-slate-900 rounded-2xl p-5 shadow"
        >
          <p className="font-bold">{item}</p>
          <p className="text-sm text-slate-500 mt-2">
            Personalized AI learning support.
          </p>
        </div>
      ))}
    </div>
  </div>
)}
          <div className="flex gap-3 mt-8 flex-wrap">
              {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={
                  activeCategory === category
                    ? "bg-blue-600 text-white px-5 py-3 rounded-full shadow transition"
                    : "bg-white px-5 py-3 rounded-full shadow hover:bg-blue-600 hover:text-white transition"
                }
              >
                {category}
              </button>
            ))}
            
          </div>
          {readingHistory.length > 0 && (
  <div className="mt-12">
    <h2 className="text-3xl font-bold text-slate-900">
      Continue Reading
    </h2>

    <p className="text-slate-500 mt-2">
      Pick up from your recent learning activity.
    </p>

    <div className="flex gap-6 mt-6 overflow-x-auto pb-4">
      {readingHistory.map((book) => (
        <Link
          key={book}
          href={`/book/${encodeURIComponent(book)}`}
          className="min-w-[240px] bg-white rounded-3xl p-5 shadow-md hover:-translate-y-2 hover:shadow-2xl transition"
        >
          <img
            src={getCover(book)}
            className="w-full h-72 rounded-2xl object-cover"
            alt={book}
          />

          <h3 className="font-bold text-slate-900 mt-4">
            {book}
          </h3>

          <p className="text-sm text-slate-500 mt-2">
            Resume learning
          </p>
        </Link>
      ))}
    </div>
  </div>
)}
          {sections.map((section) => (
            <div key={section.title} className="mt-12">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">
                    {section.title}
                  </h2>
                  <p className="text-slate-500 mt-2">
                    {section.subtitle}
                  </p>
                </div>

                <button className="bg-white px-5 py-2 rounded-xl shadow text-sm">
                  View All
                </button>
              </div>

              <div className="flex gap-6 mt-6 overflow-x-auto pb-4">
                {section.books.map((book) => (
                  <Link
                    href={`/book/${encodeURIComponent(book)}`}
                    key={`${section.title}-${book}`}
                    className="min-w-[240px]"
                  >
                    <div className="bg-white rounded-3xl p-5 shadow-md hover:-translate-y-2 hover:shadow-2xl transition duration-300">
                      <img
                        src={getCover(book)}
                        className="w-full h-72 rounded-2xl object-cover"
                        alt={book}
                      />

                      <h3 className="font-bold text-slate-900 mt-4">
                        {book}
                      </h3>

                      <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
                        <p>⭐ 4.8</p>
                        <p>12k learners</p>
                      </div>

                      <div className="mt-4 bg-blue-50 text-blue-700 rounded-xl p-3 text-sm">
                        AI Summary • Quiz • Flashcards
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-16 bg-white rounded-3xl p-8 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-slate-900">
                  National Learning Insights
                </h2>

                <p className="text-slate-500 mt-2">
                  AI-powered analytics for public learning infrastructure
                </p>
              </div>

              <Link href="/admin" className="bg-black text-white px-5 py-3 rounded-xl">
                Open Admin Dashboard
              </Link>
            </div>

            <div className="grid grid-cols-4 gap-6 mt-8">
              {[
                ["2.4M", "Active Students"],
                ["185K", "Daily AI Queries"],
                ["96%", "Learning Satisfaction"],
                ["28", "States Connected"],
              ].map(([value, label]) => (
                <div key={label} className="bg-slate-50 rounded-3xl p-6">
                  <p className="text-4xl font-bold text-slate-900">
                    {value}
                  </p>

                  <p className="text-slate-500 mt-2">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}