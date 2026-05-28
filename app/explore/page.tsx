import Link from "next/link";

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <Link href="/" className="text-blue-600 font-semibold">
        ← Back to Library
      </Link>

      <div className="mt-8 bg-white rounded-3xl p-10 shadow-xl">
        <h1 className="text-5xl font-bold text-slate-900">Explore</h1>

        <p className="mt-4 text-slate-500 text-lg">
          Discover subjects, categories, recommendations, and learning pathways.
        </p>
      </div>
    </main>
  );
}