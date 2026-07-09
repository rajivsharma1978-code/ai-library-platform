"use client";

import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import PageHeader from "@/components/ui/PageHeader";

const categories = [
  "Artificial Intelligence",
  "Machine Learning",
  "Data Science",
  "Cyber Security",
  "Cloud Computing",
  "Healthcare",
  "Research",
  "Business",
];

const learningPaths = [
  {
    title: "Become an AI Engineer",
    books: 12,
    duration: "8 Weeks",
  },
  {
    title: "Data Science Mastery",
    books: 15,
    duration: "10 Weeks",
  },
  {
    title: "Cyber Security Specialist",
    books: 9,
    duration: "6 Weeks",
  },
];

export default function ExplorePage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Explore Knowledge"
          subtitle="Discover books, learning paths, research material, exam preparation content, and AI-curated recommendations."
          homeLabel="Back to Library"
        />

        <section className="mt-4">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            Browse Categories
          </h2>

          <div className="grid md:grid-cols-4 gap-4">
            {categories.map((category) => (
              <div
                key={category}
                className="bg-white rounded-3xl p-6 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 transition"
              >
                <h3 className="font-black text-lg text-slate-900">
                  {category}
                </h3>

                <p className="text-slate-500 text-sm mt-2">
                  Explore books, summaries and AI learning tools.
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            AI Recommended Learning Paths
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {learningPaths.map((path) => (
              <div
                key={path.title}
                className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5"
              >
                <h3 className="font-black text-xl text-slate-950">
                  {path.title}
                </h3>

                <p className="mt-3 text-slate-500">
                  {path.books} Books
                </p>

                <p className="text-slate-500">
                  Duration: {path.duration}
                </p>

                <button className="mt-6 bg-orange-600 text-white px-5 py-3 rounded-xl font-bold shadow-md shadow-orange-500/25 transition hover:bg-orange-700">
                  Start Path
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 pb-6">
          <div className="bg-white rounded-[2rem] p-10 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
            <h2 className="text-lg font-black text-slate-900">
              Trending Topics
            </h2>

            <div className="flex flex-wrap gap-3 mt-6">
              {[
                "Generative AI",
                "LLMs",
                "Prompt Engineering",
                "Quantum Computing",
                "Climate Research",
                "Digital Health",
                "FinTech",
                "Robotics",
              ].map((topic) => (
                <span
                  key={topic}
                  className="bg-amber-50 text-amber-800 font-semibold px-4 py-2 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}