import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-blue-700 font-semibold">
            ← Back to Library
          </Link>

          <h1 className="text-4xl font-bold mt-4">
            Citizen Learning Dashboard
          </h1>

          <p className="text-slate-500 mt-2">
            National AI knowledge access across age groups, regions, languages,
            and learning needs.
          </p>
        </div>

        <button className="bg-black text-white px-6 py-3 rounded-xl">
          Generate Ministry Report
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6 mt-10">
        {[
          ["2.4M", "Active Learners"],
          ["28", "States Connected"],
          ["14", "Languages Used"],
          ["185K", "Daily AI Queries"],
        ].map(([value, label]) => (
          <div key={label} className="bg-white p-6 rounded-3xl shadow">
            <p className="text-4xl font-bold">{value}</p>
            <p className="text-slate-500 mt-2">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mt-8">
        <div className="bg-white p-6 rounded-3xl shadow">
          <h2 className="text-xl font-bold">Audience Mix</h2>

          <div className="mt-6 space-y-4">
            {[
              ["Students", "42%"],
              ["Senior Citizens", "18%"],
              ["Researchers", "14%"],
              ["Teachers", "12%"],
              ["General Readers", "14%"],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <p>{label}</p>
                  <p>{value}</p>
                </div>

                <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                  <div
                    className="bg-blue-600 h-3 rounded-full"
                    style={{ width: value }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow">
          <h2 className="text-xl font-bold">Language Access</h2>

          <div className="mt-6 space-y-4">
            {["Hindi", "English", "Bengali", "Tamil", "Telugu", "Marathi"].map(
              (language) => (
                <div
                  key={language}
                  className="flex justify-between bg-slate-100 p-3 rounded-xl"
                >
                  <span>{language}</span>
                  <span className="font-semibold">Active</span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-700 to-purple-700 text-white p-6 rounded-3xl shadow">
          <p className="uppercase text-sm tracking-widest opacity-80">
            Accessibility Insight
          </p>

          <h2 className="text-3xl font-bold mt-4">
            Senior Reading Mode Usage Up 31%
          </h2>

          <p className="mt-4 text-blue-100 leading-7">
            Larger fonts, voice assistance, translation, and simplified AI
            explanations can increase access for elderly citizens and regional
            language users.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-8">
        <div className="bg-white p-6 rounded-3xl shadow">
          <h2 className="text-xl font-bold">Top Use Cases</h2>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {[
              "Book Summaries",
              "Regional Translation",
              "Voice Learning",
              "Exam Preparation",
              "Research Assistance",
              "Senior Reading Mode",
            ].map((item) => (
              <div key={item} className="bg-slate-100 p-4 rounded-2xl">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow">
          <h2 className="text-xl font-bold">System Health</h2>

          <div className="mt-6 space-y-4">
            {[
              ["AI Tutor", "Ready"],
              ["PDF Import", "Ready"],
              ["Translation", "Demo Mode"],
              ["OpenAI Billing", "Pending Activation"],
            ].map(([label, status]) => (
              <div
                key={label}
                className="flex justify-between bg-slate-100 p-4 rounded-xl"
              >
                <span>{label}</span>
                <span className="font-semibold">{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}