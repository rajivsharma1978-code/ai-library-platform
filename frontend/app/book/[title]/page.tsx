import Link from "next/link";

interface BookPageProps {
  params: Promise<{
    title: string;
  }>;
}

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

export default async function BookPage({ params }: BookPageProps) {
  const { title } = await params;
  const bookTitle = decodeURIComponent(title);
  const coverImage = getCover(bookTitle);

  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-block mb-8 text-blue-700 font-semibold">
          ← Back to Library
        </Link>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-2 gap-0">
            <div className="bg-gradient-to-br from-slate-900 to-blue-900 p-10 flex items-center justify-center">
              <img
                src={coverImage}
                className="w-[75%] max-h-[560px] rounded-2xl object-cover shadow-2xl"
                alt={bookTitle}
              />
            </div>

            <div className="p-10">
              <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold">
                AI Ready Book
              </span>

              <h1 className="text-5xl font-bold mt-6 text-slate-900">
                {bookTitle}
              </h1>

              <p className="mt-4 text-slate-500">
                Smart digital learning resource
              </p>

              <p className="mt-6 text-slate-600 leading-8 text-lg">
                Learn {bookTitle} with AI summaries, smart notes, instant Q&A,
                flashcards, quiz generation, PDF upload, multilingual support,
                and personalized explanations.
              </p>

              <div className="grid grid-cols-3 gap-4 mt-8">
                {[
                  ["4.8", "Rating"],
                  ["12k", "Learners"],
                  ["6 hrs", "Study Time"],
                ].map(([value, label]) => (
                  <div key={label} className="bg-slate-100 p-4 rounded-2xl">
                    <p className="text-2xl font-bold text-slate-900">{value}</p>
                    <p className="text-sm text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 mt-10">
                <Link
                  href={`/reader?book=${encodeURIComponent(bookTitle)}`}
                  className="bg-black text-white px-8 py-4 rounded-2xl hover:bg-slate-800"
                >
                  Read Now
                </Link>

                <Link
                  href={`/reader?book=${encodeURIComponent(bookTitle)}`}
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700"
                >
                  Ask AI
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-10">
                {[
                  "AI Summary",
                  "Import Study Material",
                  "Quiz Generator",
                  "Flashcards",
                  "Smart Notes",
                  "Multilingual Learning",
                ].map((feature) => (
                  <div key={feature} className="bg-slate-50 p-5 rounded-2xl border">
                    <p className="font-bold text-slate-900">{feature}</p>
                    <p className="text-sm text-slate-500 mt-2">
                      Powered learning support
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}