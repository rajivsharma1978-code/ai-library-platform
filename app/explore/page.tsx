import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

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
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link
          href="/"
          className="text-blue-600 font-semibold"
        >
          ← Back to Library
        </Link>

        <div className="mt-8 bg-gradient-to-r from-blue-700 to-purple-700 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">
            Explore Knowledge
          </h1>

          <p className="mt-4 text-lg text-blue-100 max-w-3xl">
            Discover books, learning paths, research material,
            exam preparation content, and AI-curated recommendations.
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-bold mb-5">
            Browse Categories
          </h2>

          <div className="grid md:grid-cols-4 gap-4">
            {categories.map((category) => (
              <div
                key={category}
                className="bg-white rounded-2xl p-6 shadow hover:shadow-xl transition"
              >
                <h3 className="font-bold text-lg">
                  {category}
                </h3>

                <p className="text-slate-500 text-sm mt-2">
                  Explore books, summaries and AI learning tools.
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-5">
            AI Recommended Learning Paths
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {learningPaths.map((path) => (
              <div
                key={path.title}
                className="bg-white rounded-3xl p-8 shadow-lg"
              >
                <h3 className="font-bold text-xl">
                  {path.title}
                </h3>

                <p className="mt-3 text-slate-500">
                  {path.books} Books
                </p>

                <p className="text-slate-500">
                  Duration: {path.duration}
                </p>

                <button className="mt-6 bg-black text-white px-5 py-3 rounded-xl">
                  Start Path
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
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
                  className="bg-slate-100 px-4 py-2 rounded-full"
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