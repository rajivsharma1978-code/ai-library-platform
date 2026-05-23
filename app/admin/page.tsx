import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-100 flex">
      <aside className="w-72 bg-slate-950 text-white p-6 min-h-screen">
        <h1 className="text-3xl font-bold">NDL AI Admin</h1>

        <p className="text-slate-400 mt-2 text-sm">
          Content and platform management
        </p>

        <div className="mt-10 space-y-4">
          {[
            "📚 Books",
            "⬆️ Upload Content",
            "🌐 Languages",
            "👥 Users",
            "📊 Analytics",
            "🤖 AI Settings",
            "🛡️ Moderation",
          ].map((item) => (
            <div
              key={item}
              className="bg-slate-900 hover:bg-blue-600 transition rounded-2xl p-4 cursor-pointer"
            >
              {item}
            </div>
          ))}
        </div>

        <Link
          href="/"
          className="block mt-10 text-blue-400 font-semibold"
        >
          ← Back to Library
        </Link>
      </aside>

      <section className="flex-1 p-8">
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">
            Admin Control Center
          </p>

          <h2 className="text-5xl font-bold mt-3">
            Manage National Digital Library
          </h2>

          <p className="mt-4 text-blue-100">
            Upload books, manage metadata, monitor AI usage, and track learning insights.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-6 mt-8">
          {[
            ["12,540", "Books"],
            ["22", "Languages"],
            ["8.2M", "Users"],
            ["185K", "Daily AI Queries"],
          ].map(([value, label]) => (
            <div key={label} className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-4xl font-bold">{value}</p>
              <p className="text-slate-500 mt-2">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-8 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">Upload Books</h3>

            <div className="mt-6 border-2 border-dashed border-slate-300 rounded-3xl p-10 text-center">
              <p className="text-slate-500">
                Drag and drop PDF / EPUB files here
              </p>

              <button className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl">
                Upload Content
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">AI Settings</h3>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between border-b pb-3">
                <span>AI Provider</span>
                <span className="font-bold">Mock / Claude / OpenAI / Ollama</span>
              </div>

              <div className="flex justify-between border-b pb-3">
                <span>Fallback Mode</span>
                <span className="font-bold text-green-600">Enabled</span>
              </div>

              <div className="flex justify-between border-b pb-3">
                <span>Multilingual AI</span>
                <span className="font-bold text-green-600">Enabled</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <h3 className="text-2xl font-bold">Recent Content Activity</h3>

          <div className="mt-6 space-y-4">
            {[
              "Artificial Intelligence uploaded",
              "Machine Learning metadata updated",
              "Hindi translation added",
              "Cyber Security book sent for review",
            ].map((item) => (
              <div key={item} className="flex justify-between border-b pb-3">
                <span>{item}</span>
                <span className="text-slate-500">Today</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}