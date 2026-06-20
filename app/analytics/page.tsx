"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export default function AnalyticsPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [quizScore, setQuizScore] = useState("0");
  const [completedQuizzes, setCompletedQuizzes] = useState("0");
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [notesSaved, setNotesSaved] = useState(0);
  const [quizzesGenerated, setQuizzesGenerated] = useState(0);
  const [lastQuizGeneratedAt, setLastQuizGeneratedAt] = useState("");
  const [revisionSummariesGenerated, setRevisionSummariesGenerated] = useState(0);
  const [lastRevisionGeneratedAt, setLastRevisionGeneratedAt] = useState("");

  useEffect(() => {
    setQuizScore(localStorage.getItem("aiQuizScore") || "0");
    setCompletedQuizzes(localStorage.getItem("aiCompletedQuizzes") || "0");

    const storedWeakTopics = localStorage.getItem("aiWeakTopics");
    if (storedWeakTopics) {
      setWeakTopics(JSON.parse(storedWeakTopics));
    }

    const savedNotes = JSON.parse(localStorage.getItem("ndl_ai_notes") || "[]");
    setNotesSaved(savedNotes.length);

    const analytics = JSON.parse(localStorage.getItem("ndl_ai_analytics") || "{}");
    setQuizzesGenerated(analytics.quizzesGenerated || 0);
    setLastQuizGeneratedAt(analytics.lastQuizGeneratedAt || "");
    setRevisionSummariesGenerated(analytics.revisionSummariesGenerated || 0);
    setLastRevisionGeneratedAt(analytics.lastRevisionGeneratedAt || "");
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-10">
        <Link
          href="/"
          className="text-blue-600 font-semibold"
        >
          ← {t.navLibrary}
        </Link>

        <div className="mt-8 bg-gradient-to-r from-indigo-700 to-purple-700 text-white rounded-3xl p-10 shadow-xl">
          <h1 className="text-5xl font-bold">
            {isEn ? "Learning Analytics" : "शिक्षण विश्लेषण"}
          </h1>

          <p className="mt-4 text-lg text-indigo-100 max-w-3xl">
            {isEn
              ? "Track reading progress, AI interactions, learning patterns, revision performance, and knowledge growth."
              : "पठन प्रगति, एआई इंटरैक्शन, सीखने के पैटर्न, पुनरीक्षण प्रदर्शन और ज्ञान वृद्धि को ट्रैक करें।"}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow">
            <p className="text-slate-500">
              {isEn ? "Notes Saved" : "सहेजे गए नोट्स"}
            </p>
            <h2 className="text-4xl font-bold mt-2">{notesSaved}</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow">
            <p className="text-slate-500">
              {t.aiF3Title}
            </p>
            <h2 className="text-4xl font-bold mt-2">{quizzesGenerated}</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow">
            <p className="text-slate-500">
              {isEn ? "Last Quiz Activity" : "अंतिम क्विज़ गतिविधि"}
            </p>
            <h2 className="text-lg font-semibold mt-2">
              {lastQuizGeneratedAt
                ? new Date(lastQuizGeneratedAt).toLocaleString()
                : (isEn ? "No activity yet" : "अभी तक कोई गतिविधि नहीं")}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow">
            <p className="text-slate-500">
              {isEn ? "AI Revision Summaries" : "एआई पुनरीक्षण सारांश"}
            </p>
            <h2 className="text-4xl font-bold mt-2">
              {revisionSummariesGenerated}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow">
            <p className="text-slate-500">
              {isEn ? "Last Revision Activity" : "अंतिम पुनरीक्षण गतिविधि"}
            </p>
            <h2 className="text-lg font-semibold mt-2">
              {lastRevisionGeneratedAt
                ? new Date(lastRevisionGeneratedAt).toLocaleString()
                : (isEn ? "No activity yet" : "अभी तक कोई गतिविधि नहीं")}
            </h2>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mt-10">
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">127</h2>
            <p className="text-slate-500 mt-2">
              {isEn ? "Hours Studied" : "अध्ययन किए गए घंटे"}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">{completedQuizzes}</h2>
            <p className="text-slate-500 mt-2">
              {isEn ? "Quizzes Completed" : "पूर्ण की गई क्विज़"}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">41</h2>
            <p className="text-slate-500 mt-2">
              {isEn ? "Books Completed" : "पूरी की गई पुस्तकें"}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-4xl font-bold">{quizScore}</h2>
            <p className="text-slate-500 mt-2">
              {isEn ? "Quiz Score" : "क्विज़ स्कोर"}
            </p>
          </div>
        </div>

        <section className="mt-12 grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              {isEn ? "Reading Performance" : "पठन प्रदर्शन"}
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
              {isEn ? "AI Learning Insights" : "एआई शिक्षण अंतर्दृष्टि"}
            </h2>

            <div className="mt-6 space-y-4">
              <div className="bg-slate-100 p-4 rounded-2xl">
                {isEn ? "Strongest Area: Artificial Intelligence" : "सबसे मजबूत क्षेत्र: आर्टिफिशियल इंटेलिजेंस"}
              </div>

              <div className="bg-slate-100 p-4 rounded-2xl">
                {isEn ? "Recommended Focus: " : "अनुशंसित फोकस: "}
                {weakTopics.length ? weakTopics.join(", ") : (isEn ? "No weak topics yet" : "अभी तक कोई कमजोर विषय नहीं")}
              </div>

              <div className="bg-slate-100 p-4 rounded-2xl">
                {isEn ? "AI Tutor Usage: High" : "एआई ट्यूटर उपयोग: उच्च"}
              </div>

              <div className="bg-slate-100 p-4 rounded-2xl">
                {isEn ? "Weekly Learning Consistency: Excellent" : "साप्ताहिक शिक्षण निरंतरता: उत्कृष्ट"}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="bg-white rounded-3xl p-10 shadow-lg">
            <h2 className="text-2xl font-bold">
              {isEn ? "AI Recommendations" : "एआई अनुशंसाएं"}
            </h2>

            <ul className="mt-6 space-y-3 text-slate-700">
              <li>
                • {isEn ? "Complete Cyber Security learning path" : "साइबर सुरक्षा शिक्षण पथ पूरा करें"}
              </li>

              <li>
                • {isEn ? "Generate revision notes for Machine Learning" : "मशीन लर्निंग के लिए पुनरीक्षण नोट्स बनाएं"}
              </li>

              <li>
                • {isEn ? "Take AI-generated quiz on Deep Learning" : "डीप लर्निंग पर एआई-जनित क्विज़ लें"}
              </li>

              <li>
                • {isEn ? "Review " : "समीक्षा करें "}
                {weakTopics.length ? weakTopics.join(", ") : (isEn ? "topics suggested by AI Tutor" : "एआई ट्यूटर द्वारा सुझाए गए विषय")}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}