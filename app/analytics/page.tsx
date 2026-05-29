"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AnalyticsPage() {
  const [quizScore, setQuizScore] = useState("0");
  const [completedQuizzes, setCompletedQuizzes] = useState("0");
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  
  useEffect(() => {
    setQuizScore(localStorage.getItem("aiQuizScore") || "0");
    setCompletedQuizzes(localStorage.getItem("aiCompletedQuizzes") || "0");
  
    const storedWeakTopics = localStorage.getItem("aiWeakTopics");
  
    if (storedWeakTopics) {
      setWeakTopics(JSON.parse(storedWeakTopics));
    }
  }, []); 
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link
          href="/"
          className="text-blue-600 font-semibold"
        >
          ← Back to Library
        </Link>

        <div className="mt-8 bg-gradient-to-r from-indigo-700 to-purple-700 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">
            Learning Analytics
          </h1>

          <p className="mt-4 text-lg text-indigo-100 max-w-3xl">
            Track reading progress, AI interactions, learning patterns,
            revision performance, and knowledge growth.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mt-10">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">127</h2>
            <p className="text-slate-500 mt-2">
              Hours Studied
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
          <h2 className="text-4xl font-bold">{completedQuizzes}</h2>
<p className="text-slate-500 mt-2">
  Quizzes Completed
</p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">41</h2>
            <p className="text-slate-500 mt-2">
              Books Completed
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
          <h2 className="text-4xl font-bold">{quizScore}</h2>
<p className="text-slate-500 mt-2">
  Quiz Score
</p> 
          </div>
        </div>

        <section className="mt-12 grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              Reading Performance
            </h2>

            <div className="mt-8 space-y-5">
              <div>
                <p className="mb-2">Artificial Intelligence</p>
                <div className="bg-slate-200 rounded-full h-4">
                  <div className="bg-blue-600 h-4 rounded-full w-[85%]" />
                </div>
              </div>

              <div>
                <p className="mb-2">Machine Learning</p>
                <div className="bg-slate-200 rounded-full h-4">
                  <div className="bg-green-600 h-4 rounded-full w-[70%]" />
                </div>
              </div>

              <div>
                <p className="mb-2">Cyber Security</p>
                <div className="bg-slate-200 rounded-full h-4">
                  <div className="bg-purple-600 h-4 rounded-full w-[55%]" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              AI Learning Insights
            </h2>

            <div className="mt-6 space-y-4">
              <div className="bg-slate-100 p-4 rounded-2xl">
                Strongest Area: Artificial Intelligence
              </div>

              <div className="bg-slate-100 p-4 rounded-2xl">
  Recommended Focus:{" "}
  {weakTopics.length ? weakTopics.join(", ") : "No weak topics yet"}
</div>

              <div className="bg-slate-100 p-4 rounded-2xl">
                AI Tutor Usage: High
              </div>

              <div className="bg-slate-100 p-4 rounded-2xl">
                Weekly Learning Consistency: Excellent
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              AI Recommendations
            </h2>

            <ul className="mt-6 space-y-3 text-slate-700">
              <li>
                • Complete Cyber Security learning path
              </li>

              <li>
                • Generate revision notes for Machine Learning
              </li>

              <li>
                • Take AI-generated quiz on Deep Learning
              </li>

              <li>
              • Review {weakTopics.length ? weakTopics.join(", ") : "topics suggested by AI Tutor"}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}