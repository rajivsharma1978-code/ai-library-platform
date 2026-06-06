"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    const access = localStorage.getItem("ndlAdminAccess");
    if (access !== "granted") {
      router.push("/admin-login");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin Control Center</p>
          <h2 className="text-5xl font-bold mt-3">Manage AI-Powered Digital Library</h2>
          <p className="mt-4 text-blue-100">
            Upload content, approve metadata, monitor AI usage, manage languages, and track accessibility readiness.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-6 mt-8">
          {[
            ["12,540", "Books"],
            ["22", "Languages"],
            ["8.2M", "Users"],
            ["185K", "Daily AI Queries"],
            ["96%", "Accessibility Score"],
            ["4,280", "PDFs Processed"],
            ["1.2M", "Voice Reads"],
            ["318", "Pending Reviews"],
          ].map(([value, label]) => (
            <div key={label} className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-4xl font-bold text-slate-900">{value}</p>
              <p className="text-slate-500 mt-2">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-8 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">Upload & Processing Queue</h3>
            <div className="mt-6 border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center">
              <p className="text-slate-500">Upload PDF / EPUB / scanned documents</p>
              <button className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl">Upload Content</button>
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <p>✅ AI text extraction enabled</p>
              <p>✅ Metadata detection enabled</p>
              <p>✅ Language detection enabled</p>
              <p>⏳ OCR pipeline pending</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">AI System Status</h3>
            <div className="mt-6 space-y-4">
              {[
                ["AI Provider", "Demo / OpenAI Ready"],
                ["PDF Extraction", "Enabled"],
                ["Multilingual AI", "Enabled"],
                ["Voice Reader", "Enabled"],
                ["Fallback Mode", "Enabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-3">
                  <span>{label}</span>
                  <span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-950 to-blue-950 rounded-3xl p-8 text-white shadow-lg">
            <p className="uppercase tracking-widest text-sm text-blue-200">AI Recommendation</p>
            <h3 className="text-3xl font-bold mt-4">Prioritize multilingual PDF intelligence</h3>
            <p className="mt-4 text-blue-100 leading-7">
              Most impact will come from AI summaries, regional language explanations, voice reading, and page-level Q&A.
            </p>
            <button className="mt-6 bg-white text-black px-5 py-3 rounded-xl">Generate Report</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-8">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">Content Approval Queue</h3>
            <div className="mt-6 space-y-4">
              {[
                ["Cyber Security Basics", "Pending metadata review"],
                ["Indian History Archive", "Needs language tagging"],
                ["AI Research Notes", "Ready for approval"],
                ["Marathi Science Textbook", "OCR quality check"],
              ].map(([title, status]) => (
                <div key={title} className="flex justify-between border-b pb-3">
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm text-slate-500">{status}</p>
                  </div>
                  <button className="bg-slate-100 px-4 py-2 rounded-xl text-sm">Review</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold">Language Coverage</h3>
            <div className="mt-6 space-y-4">
              {[
                ["Hindi", "92%"],
                ["Tamil", "78%"],
                ["Bengali", "84%"],
                ["Marathi", "69%"],
                ["Telugu", "64%"],
              ].map(([language, value]) => (
                <div key={language}>
                  <div className="flex justify-between text-sm">
                    <p>{language}</p>
                    <p>{value}</p>
                  </div>
                  <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                    <div className="bg-blue-600 h-3 rounded-full" style={{ width: value }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <h3 className="text-2xl font-bold">Recent Platform Activity</h3>
          <div className="mt-6 space-y-4">
            {[
              "Artificial Intelligence PDF uploaded and indexed",
              "Machine Learning metadata updated",
              "Hindi explanation layer added",
              "Cyber Security book sent for approval",
              "Voice reader used 1,240 times today",
              "PDF extraction pipeline processed 420 files",
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
