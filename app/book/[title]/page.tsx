import Link from "next/link";
import SaveBookButton from "@/components/SaveBookButton";

interface BookPageProps {
  params: Promise<{
    title: string;
  }>;
}
const demoBookContent: Record<string, string> = {
  "Artificial Intelligence":
    "Artificial Intelligence explores machine intelligence, neural networks, reasoning systems, robotics, and intelligent learning models used across industries.",
    
  "Machine Learning":
    "Machine Learning focuses on training algorithms using datasets, prediction models, supervised learning, and deep neural architectures.",

  "Data Science":
    "Data Science combines statistics, machine learning, data visualization, and analytics for extracting insights from structured and unstructured data.",

  Robotics:
    "Robotics introduces intelligent machines, automation systems, sensors, motion control, and AI-powered physical systems.",

  "Deep Learning":
    "Deep Learning explores neural networks, transformers, computer vision, and advanced AI architectures.",

  "Python Basics":
    "Python Basics introduces variables, loops, functions, syntax, and beginner-friendly programming concepts.",

  "Quantum Computing":
    "Quantum Computing introduces qubits, superposition, entanglement, and next-generation computational systems.",

  "Cloud Architecture":
    "Cloud Architecture explains distributed infrastructure, cloud services, scaling systems, and deployment models.",

  "Cyber Security":
    "Cyber Security covers network protection, ethical hacking, encryption, digital threats, and secure systems.",
};
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
  const bookTitle =
  title && title !== "null" && title !== "undefined"
    ? decodeURIComponent(title)
    : "Artificial Intelligence";
  const coverImage = getCover(bookTitle);
  const demoContent =
  demoBookContent[bookTitle] ||
  "AI-powered digital learning content.";



  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 p-10">
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="inline-block mb-8 text-blue-700 font-semibold">
          ← Back to Library
        </Link>

        <section className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-5">
            <div className="col-span-2 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-12 flex items-center justify-center">
              <div>
                <img
                  src={coverImage}
                  className="w-[360px] max-h-[560px] rounded-3xl object-cover shadow-2xl"
                  alt={bookTitle}
                />

                <div className="grid grid-cols-3 gap-3 mt-6 text-white text-center">
                  <div className="bg-white/10 rounded-2xl p-3">
                    <p className="text-xl font-bold">4.8</p>
                    <p className="text-xs text-blue-100">Rating</p>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-3">
                    <p className="text-xl font-bold">12k</p>
                    <p className="text-xs text-blue-100">Learners</p>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-3">
                    <p className="text-xl font-bold">6 hrs</p>
                    <p className="text-xs text-blue-100">Read Time</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-3 p-12">
              <div className="flex gap-3 flex-wrap">
                <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold">
                  AI Ready
                </span>

                <span className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold">
                  Accessible Reader
                </span>

                <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
                  Multilingual Support
                </span>
              </div>

              <h1 className="text-6xl font-bold mt-8 text-slate-900 leading-tight">
                {bookTitle}
              </h1>

              <p className="mt-4 text-slate-500 text-lg">
                Smart digital learning resource
              </p>

              <p className="mt-8 text-slate-600 leading-8 text-lg max-w-3xl">
                Explore {bookTitle} through two powerful modes: a clean classic
                reading experience for focused study, and an AI-powered learning
                workspace for summaries, multilingual explanations, quizzes,
                notes, flashcards, voice support, and personalized assistance.
              </p>

              <div className="flex gap-4 mt-10 flex-wrap">
              <Link
  href={`/read?book=${encodeURIComponent(bookTitle)}&demo=true`}
  className="bg-black text-white px-8 py-4 rounded-2xl hover:bg-slate-800 shadow-lg"
>
  Read Now
</Link>

<Link
  href={`/reader?book=${encodeURIComponent(bookTitle)}&demo=true`}
  className="bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700 shadow-lg"
>
  Ask AI
</Link>
<SaveBookButton bookTitle={bookTitle} />
              </div>

              <div className="grid grid-cols-3 gap-4 mt-10">
                {[
                  ["Classic Reader", "PDF-style reading with zoom, fullscreen, page controls"],
                  ["AI Tutor", "Ask questions, summarize, simplify and quiz yourself"],
                  ["Voice Access", "Read aloud and hands-free accessibility support"],
                  ["Indian Languages", "Explain concepts in Hindi, Tamil, Bengali and more"],
                  ["Smart Notes", "Save, export and organize important learning points"],
                  ["Related Concepts", "Discover connected topics and recommended books"],
                ].map(([title, description]) => (
                  <div key={title} className="bg-slate-50 p-5 rounded-2xl border">
                    <p className="font-bold text-slate-900">{title}</p>
                    <p className="text-sm text-slate-500 mt-2 leading-6">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-6 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900">
              About this Book
            </h2>

            <p className="text-slate-600 mt-4 leading-7">
              This learning resource introduces core ideas, practical
              applications, and foundational concepts. It is optimized for both
              regular reading and AI-assisted learning.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900">
              Accessibility
            </h2>

            <div className="mt-4 space-y-3 text-slate-600">
              <p>✓ Read aloud support</p>
              <p>✓ Voice command foundation</p>
              <p>✓ Zoom and font controls</p>
              <p>✓ Dark mode reading</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-700 to-purple-700 rounded-3xl p-8 text-white shadow-lg">
            <p className="uppercase tracking-widest text-sm opacity-80">
              AI Learning Insight
            </p>

            <h2 className="text-3xl font-bold mt-4">
              Recommended for guided learning
            </h2>

            <p className="text-blue-100 mt-4 leading-7">
              AI can personalize explanations based on user level, language,
              reading speed, and learning goals.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">
                Similar Books
              </h2>

              <p className="text-slate-500 mt-2">
                Continue exploring related learning resources.
              </p>
            </div>

            <Link href="/" className="bg-black text-white px-5 py-3 rounded-xl">
              Browse Library
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-6 mt-6">
            {["Machine Learning", "Data Science", "Robotics", "Deep Learning"].map(
              (book) => (
                <Link
                  key={book}
                  href={`/book/${encodeURIComponent(book)}`}
                  className="bg-slate-50 rounded-2xl p-5 hover:-translate-y-1 hover:shadow-xl transition"
                >
                  <img
                    src={getCover(book)}
                    className="w-full h-56 object-cover rounded-xl"
                    alt={book}
                  />

                  <h3 className="font-bold mt-4 text-slate-900">
                    {book}
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    AI Ready • Multilingual
                  </p>
                </Link>
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}