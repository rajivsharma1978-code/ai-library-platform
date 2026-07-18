"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import FlipBookViewer from "@/components/reader/FlipBookViewer";

// Chapter ids and their body content are internal/demo content, not UI
// chrome — kept in English and used as-is for state/comparisons/storage.
// Only their on-screen labels (CHAPTER_LABELS, built from t.* inside the
// component) are translated.
const chapters: Record<string, string[]> = {
  Introduction: [
    "This chapter introduces the foundation of intelligent learning systems.",
    "Students can understand the subject through summaries, examples, and AI-guided explanations.",
    "AI-first libraries combine reading, tutoring, notes, quizzes, and revision into one experience.",
  ],
  "Core Concepts": [
    "Core concepts explain the building blocks behind the subject.",
    "The goal is to simplify complex ideas using structured learning and examples.",
    "AI can convert difficult paragraphs into simple language for every learner.",
  ],
  Applications: [
    "Applications show how the subject is used in education, research, and industry.",
    "Students can connect theory with real-world use cases.",
    "AI helps learners discover practical examples faster.",
  ],
  "Case Studies": [
    "Case studies help students understand how concepts work in real situations.",
    "They improve critical thinking and practical understanding.",
    "AI can summarize long case studies into key insights.",
  ],
  "Future Scope": [
    "Future scope explains how the subject may evolve over time.",
    "AI-powered platforms will make learning more personalized and accessible.",
    "Digital libraries can become intelligent national learning platforms.",
  ],
  "Research Topics": [
    "Research topics help advanced learners explore deeper questions.",
    "AI can recommend papers, generate summaries, and explain academic concepts.",
    "This creates a stronger bridge between students, books, and research.",
  ],
};

// Each action's label is a UI string (translated via ACTION_LABEL_MAP
// inside the component); its prompt is sent to the AI API verbatim and
// must stay in English for the AI request logic to keep working exactly
// as before. "Hindi" is a language name, not a UI label — deliberately
// left out of ACTION_LABEL_MAP so it falls back to its raw value.
const modeActions: Record<string, [string, string][]> = {
  Student: [
    ["Summarize", "Summarize this page in simple student-friendly points."],
    ["Explain Simply", "Explain this page like I am a beginner."],
    ["Quiz", "Create a short quiz from this page."],
    ["Flashcards", "Create flashcards from this page."],
    ["Hindi", "Explain this page in Hindi."],
  ],
  Teacher: [
    ["Lesson Plan", "Create a lesson plan from this page."],
    ["Teaching Notes", "Create teacher notes from this page."],
    ["Class Questions", "Create classroom discussion questions."],
    ["Homework", "Create homework from this page."],
    ["Blackboard Summary", "Create a blackboard-style summary."],
  ],
  Researcher: [
    ["Key Concepts", "Extract research-level key concepts from this page."],
    ["Critical Analysis", "Critically analyze this page."],
    ["Research Questions", "Generate research questions from this page."],
    ["Further Reading", "Suggest deeper topics to explore."],
    ["Academic Summary", "Create an academic-style summary."],
  ],
  "Exam Prep": [
    ["Likely Questions", "Generate likely exam questions from this page."],
    ["MCQs", "Create multiple-choice questions from this page."],
    ["Short Notes", "Create exam revision notes."],
    ["Important Points", "List high-scoring important points."],
    ["Revision Plan", "Create a quick revision plan."],
  ],
  "Elder Friendly": [
    ["Simple Meaning", "Explain this page in very simple language."],
    ["Slow Explanation", "Explain this slowly and clearly."],
    ["Voice Summary", "Prepare a voice-friendly summary."],
    ["Regional Language", "Explain this in simple Hindi."],
    ["Daily Life Example", "Explain using daily-life examples."],
  ],
};

type Message = { type: "user" | "ai"; text: string; };

function ReaderPageContent() {
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  // Render-time label lookups — internal values (chapter ids, study
  // mode ids) stay in English for state, comparisons, and localStorage;
  // only these maps translate them for display.
  const CHAPTER_LABELS: Record<string, string> = {
    Introduction: t.readerChapterIntroduction,
    "Core Concepts": t.readerChapterCoreConcepts,
    Applications: t.readerChapterApplications,
    "Case Studies": t.readerChapterCaseStudies,
    "Future Scope": t.readerChapterFutureScope,
    "Research Topics": t.readerChapterResearchTopics,
  };
  const STUDY_MODE_LABELS: Record<string, string> = {
    Student: t.readerModeStudent,
    Teacher: t.readerModeTeacher,
    Researcher: t.readerModeResearcher,
    "Exam Prep": t.readerModeExamPrep,
    "Elder Friendly": t.readerModeElderFriendly,
  };
  const MODE_DESCRIPTIONS: Record<string, string> = {
    Student: t.readerModeDescStudent,
    Teacher: t.readerModeDescTeacher,
    Researcher: t.readerModeDescResearcher,
    "Exam Prep": t.readerModeDescExamPrep,
    "Elder Friendly": t.readerModeDescElderFriendly,
  };
  const ACTION_LABEL_MAP: Record<string, string> = {
    Summarize: t.aiActionSummarize,
    "Explain Simply": t.readerActionExplainSimply,
    Quiz: t.quizPageTitle,
    Flashcards: t.commonFlashcards,
    "Lesson Plan": t.readerActionLessonPlan,
    "Teaching Notes": t.readerActionTeachingNotes,
    "Class Questions": t.readerActionClassQuestions,
    Homework: t.readerActionHomework,
    "Blackboard Summary": t.readerActionBlackboardSummary,
    "Key Concepts": t.readerActionKeyConcepts,
    "Critical Analysis": t.readerActionCriticalAnalysis,
    "Research Questions": t.readerActionResearchQuestions,
    "Further Reading": t.readerActionFurtherReading,
    "Academic Summary": t.readerActionAcademicSummary,
    "Likely Questions": t.readerActionLikelyQuestions,
    MCQs: t.readerActionMCQs,
    "Short Notes": t.readerActionShortNotes,
    "Important Points": t.readerActionImportantPoints,
    "Revision Plan": t.readerActionRevisionPlan,
    "Simple Meaning": t.readerActionSimpleMeaning,
    "Slow Explanation": t.readerActionSlowExplanation,
    "Voice Summary": t.readerActionVoiceSummary,
    "Regional Language": t.readerActionRegionalLanguage,
    "Daily Life Example": t.readerActionDailyLifeExample,
  };

  const [pdfText, setPdfText] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfPages, setPdfPages] = useState("");
  const [pageImage, setPageImage] = useState("");
  const [rightPageImage, setRightPageImage] = useState("");
  const [question, setQuestion] = useState("");
  type SavedNote = { id: string; bookTitle: string; chapter?: string; text: string; createdAt: string; };
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState(0);
  const [completedQuizzes, setCompletedQuizzes] = useState(0);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [flashcards, setFlashcards] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showBookInfo, setShowBookInfo] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [selectedText, setSelectedText] = useState("");
  const [activeChapter, setActiveChapter] = useState("Introduction");
  const [isThinking, setIsThinking] = useState(false);
  const [studyMode, setStudyMode] = useState("Student");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [messages, setMessages] = useState<Message[]>([]);

  const initialPage = Number(searchParams.get("page") || "1");
  const [readerPage, setReaderPage] = useState(initialPage);

  const book = searchParams.get("book") || searchParams.get("pdf") || pdfName || "Artificial Intelligence";
  const isDemoBook = searchParams.get("demo") === "true";
  const isPdfMode = Boolean(pdfText);

  const activeContent = isPdfMode ? pdfText.slice(0, 5000) : chapters[activeChapter].join(" ");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
    if (book) localStorage.setItem("ndl_continue_reading", book);
    const history = JSON.parse(localStorage.getItem("readingHistory") || "[]");
    const updated = [book, ...history.filter((item: string) => item !== book)].slice(0, 10);
    localStorage.setItem("readingHistory", JSON.stringify(updated));
  }, [book]);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem("aiReaderMessages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => { localStorage.setItem("aiStudyMode", studyMode); }, [studyMode]);

  useEffect(() => {
    localStorage.setItem("aiReaderPage", String(readerPage));
    const leftImage = localStorage.getItem(`uploadedPdfPageImage_${readerPage}`) || "";
    const rightImage = localStorage.getItem(`uploadedPdfPageImage_${Number(readerPage) + 1}`) || "";
    setPageImage(leftImage);
    setRightPageImage(rightImage);
  }, [readerPage]);

  useEffect(() => { localStorage.setItem("aiSavedNotes", JSON.stringify(savedNotes)); }, [savedNotes]);
  useEffect(() => { localStorage.setItem("aiBookmarks", JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => {
    localStorage.setItem("aiQuizScore", String(quizScore));
    localStorage.setItem("aiCompletedQuizzes", String(completedQuizzes));
    localStorage.setItem("aiWeakTopics", JSON.stringify(weakTopics));
  }, [quizScore, completedQuizzes, weakTopics]);



  useEffect(() => {
    const demoBookContent: Record<string, string> = {
      "Artificial Intelligence": "Artificial Intelligence explores machine intelligence, neural networks, reasoning systems, robotics, and intelligent learning models used across industries.",
      "Machine Learning": "Machine Learning focuses on training algorithms using datasets, prediction models, supervised learning, and deep neural architectures.",
      "Data Science": "Data Science combines statistics, machine learning, data visualization, and analytics for extracting insights from structured and unstructured data.",
      Robotics: "Robotics introduces intelligent machines, automation systems, sensors, motion control, and AI-powered physical systems.",
      "Deep Learning": "Deep Learning explores neural networks, transformers, computer vision, and advanced AI architectures.",
      "Python Basics": "Python Basics introduces variables, loops, functions, syntax, and beginner-friendly programming concepts.",
      "Quantum Computing": "Quantum Computing introduces qubits, superposition, entanglement, and next-generation computational systems.",
      "Cloud Architecture": "Cloud Architecture explains distributed infrastructure, cloud services, scaling systems, and deployment models.",
      "Cyber Security": "Cyber Security covers network protection, ethical hacking, encryption, digital threats, and secure systems.",
    };
    const rawPdfText = isDemoBook ? demoBookContent[book] || "" : localStorage.getItem("uploadedPdfText") || "";
    const storedPdfText = rawPdfText.includes("const canvases") || rawPdfText.includes("document.querySelectorAll") || rawPdfText.includes("HTMLCanvasElement") ? "" : rawPdfText;
    const storedPdfName = isDemoBook ? book : localStorage.getItem("uploadedPdfName") || "";
    const storedPdfPages = isDemoBook ? "Demo" : localStorage.getItem("uploadedPdfPages") || searchParams.get("pages") || "";
    setPdfText(storedPdfText);
    setPdfName(storedPdfName);
    setPdfPages(storedPdfPages);

    const welcomeMessage = storedPdfText
      ? `${t.chatWelcome}\n\n${t.pages}: ${readerPage}.\n\n${t.aiStartSession}: ${STUDY_MODE_LABELS[studyMode] ?? studyMode}.`
      : `${t.chatWelcome}\n\n${t.pages}: ${readerPage}.\n\n${t.aiStartSession}: ${STUDY_MODE_LABELS[studyMode] ?? studyMode}.`;

    setMessages([{ type: "ai", text: welcomeMessage }]);
  }, []);

  // useLanguage() intentionally renders "en" on the first frame (to avoid a
  // hydration mismatch) and corrects itself in an effect shortly after — so
  // the mount effect above can bake in an English greeting even when a
  // non-English language is already selected. Re-sync just that greeting
  // when the language settles, but only while it's still the sole message,
  // so real conversation history is never touched.
  useEffect(() => {
    setMessages(prev => {
      if (prev.length !== 1 || prev[0].type !== "ai") return prev;
      const welcomeMessage = `${t.chatWelcome}\n\n${t.pages}: ${readerPage}.\n\n${t.aiStartSession}: ${STUDY_MODE_LABELS[studyMode] ?? studyMode}.`;
      return [{ type: "ai", text: welcomeMessage }];
    });
  }, [language]);

  function summarizeBook() {
    addAIMessage(isPdfMode
      ? "Create a fast 2-minute summary of this uploaded PDF using the available extracted text. Mention main topic, important sections, and what the reader should understand first."
      : "Create a fast 2-minute book summary. Focus on the main idea, key concepts, who should read it, and what the learner will understand after reading."
    );
  }

  function summarizeCurrentSection() {
    addAIMessage(isPdfMode
      ? `Summarize the current PDF page or visible PDF section in simple language. Page: ${readerPage}`
      : `Summarize the current chapter in simple language. Chapter: ${activeChapter}`
    );
  }

  async function addAIMessage(questionText: string, forceLanguage?: string) {
    setIsThinking(true);
    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `[Study Mode: ${studyMode}] [Answer Language: ${forceLanguage || selectedLanguage}] ${questionText}. IMPORTANT: Answer only in ${forceLanguage || selectedLanguage}. Do not answer in English unless the selected language is English.`,
          book,
          chapter: isPdfMode ? `PDF Page ${readerPage}` : activeChapter,
          content: isPdfMode ? (localStorage.getItem("uploadedPdfText") || activeContent).slice(0, 12000) : activeContent,
        }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, { type: "ai", text: data.answer || `AI response using ${isPdfMode ? "uploaded PDF content" : activeChapter}: ${activeContent.slice(0, 500)}...` }]);
    } catch {
      setMessages(prev => [...prev, { type: "ai", text: `Demo AI answer based on ${isPdfMode ? "your uploaded PDF" : activeChapter}: ${questionText}. This system can summarize, explain, quiz, translate, and personalize learning from real document content.` }]);
    }
    setIsThinking(false);
  }

  function sendMessage() {
    if (!question.trim()) return;
    const userQuestion = question;
    setMessages(prev => [...prev, { type: "user", text: userQuestion }]);
    setQuestion("");
    addAIMessage(userQuestion);
  }

  function askAboutSelectedText() {
    if (!selectedText.trim()) return;
    setMessages(prev => [...prev, { type: "user", text: `Explain this: ${selectedText}` }]);
    addAIMessage(`Explain this selected text in simple language: ${selectedText}`);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }

  function multilingualResponse(lang: string) {
    setSelectedLanguage(lang);
    const rawPdfText = localStorage.getItem("uploadedPdfText") || "";
    const hasRealPdfText = rawPdfText.length > 200 && !rawPdfText.includes("not accessible") && !rawPdfText.includes("Text extraction failed") && !rawPdfText.includes("Automatic scan completed") && !rawPdfText.includes("no readable text");
    const contentToExplain = isPdfMode && hasRealPdfText ? rawPdfText : activeContent;
    addAIMessage(`Explain the following learning content in ${lang}. Do not say the content is unavailable. Use simple language.\n\nCONTENT:\n${contentToExplain.slice(0, 6000)}`, lang);
  }

  function saveBookmark() {
    const bookmark = isPdfMode ? `${book} - PDF Page ${readerPage}` : `${book} - ${activeChapter}`;
    setBookmarks(prev => prev.includes(bookmark) ? prev : [...prev, bookmark]);
    setMessages(prev => [...prev, { type: "ai", text: t.readerBookmarkSavedMsg.replace("{bookmark}", bookmark) }]);
  }

  function saveCurrentNote() {
    const newNote = {
      id: Date.now().toString(),
      bookTitle: isPdfMode ? "Uploaded PDF" : "Artificial Intelligence",
      chapter: isPdfMode ? `PDF Page ${readerPage}` : activeChapter,
      text: isPdfMode ? activeContent.slice(0, 250) : chapters[activeChapter][0],
      createdAt: new Date().toISOString(),
    };
    const updatedNotes = [...savedNotes, newNote];
    setSavedNotes(updatedNotes);
    localStorage.setItem("ndl_ai_notes", JSON.stringify(updatedNotes));
  }

  function generateFlashcards() {
    const sourceText = activeContent.slice(0, 600);
    const cards = [
      `What is the main idea? → ${sourceText.slice(0, 120)}...`,
      `Key concept → ${isPdfMode ? "PDF page content" : activeChapter}`,
      `Revision prompt → Explain this topic in your own words.`,
    ];
    setFlashcards(cards);
    setMessages(prev => [...prev, { type: "ai", text: t.readerFlashcardsGeneratedMsg }]);
  }

  function recordQuizResult(score: number, topic: string) {
    setQuizScore(prev => prev + score);
    setCompletedQuizzes(prev => prev + 1);
    if (score < 60) setWeakTopics(prev => prev.includes(topic) ? prev : [...prev, topic]);
    const topicLabel = CHAPTER_LABELS[topic] ?? topic;
    const resultMsg = score < 60 ? t.readerQuizAddedToRevisionMsg.replace("{topic}", topicLabel) : t.readerQuizGoodPerformanceMsg;
    setMessages(prev => [...prev, { type: "ai", text: `${t.readerQuizRecordedMsg.replace("{score}", String(score))} ${resultMsg}` }]);
  }

  function exportNotes() {
    const notesText = savedNotes.length ? savedNotes.join("\n\n") : "No saved notes yet.";
    const blob = new Blob([notesText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book}-notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={darkMode ? "h-screen flex bg-slate-950 text-white overflow-hidden" : "h-screen flex bg-[#f6efe3] text-slate-900 overflow-hidden"}>
      <aside className={focusMode ? "hidden" : "w-72 bg-slate-950 text-white p-6 overflow-auto border-r border-white/10"}>
        <Link href="/" className="text-blue-400 font-semibold">
          ← {t.commonHome}
        </Link>

        <h2 className="text-3xl font-bold mt-8">{t.aiF1Title}</h2>
        <p className="text-slate-400 mt-2 text-sm">
          {isPdfMode ? t.pdfViewer : t.searchPlaceholder}
        </p>

        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {isPdfMode ? t.pdfViewer : t.readerChaptersHeading}
          </p>

          {isPdfMode ? (
            <div className="mt-4 bg-slate-900 rounded-2xl p-4">
              <p className="font-bold break-words">{pdfName || book}</p>
              <p className="text-xs text-slate-400 mt-2">{t.pages}: {readerPage}</p>
              <p className="text-xs text-slate-400 mt-1">{t.pages}: {pdfPages || t.readerPagesDetectedAfterUpload}</p>
              <p className="text-xs text-green-400 mt-3">{t.readerPdfTextLoaded}</p>
              <p className={pageImage ? "text-xs text-green-400 mt-2" : "text-xs text-yellow-400 mt-2"}>
                {pageImage ? t.readerVisualCaptured : t.readerVisualNotCaptured}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {Object.keys(chapters).map((chapter) => (
                <button key={chapter} onClick={() => setActiveChapter(chapter)}
                  className={activeChapter === chapter
                    ? "w-full text-left bg-blue-600 p-4 rounded-2xl shadow-lg"
                    : "w-full text-left bg-slate-900 hover:bg-slate-800 p-4 rounded-2xl transition"}>
                  {CHAPTER_LABELS[chapter] ?? chapter}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 bg-slate-900 p-5 rounded-3xl">
          <p className="text-sm font-bold">{t.progress}</p>
          <div className="w-full bg-slate-700 h-3 rounded-full mt-4">
            <div className="bg-blue-500 h-3 rounded-full w-[58%]" />
          </div>
          <p className="text-xs text-slate-400 mt-3">{t.readerSessionProgress.replace("{pct}", "58")}</p>
        </div>
      </aside>

      <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/30 bg-white/80 px-4 py-2 shadow-xl backdrop-blur-xl flex items-center gap-2">
        <button onClick={() => setReaderFontSize(size => Math.max(15, size - 1))} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white">A-</button>
        <button onClick={() => setReaderFontSize(size => Math.min(26, size + 1))} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white">A+</button>
        <button onClick={() => setFocusMode(!focusMode)} className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white">
          {focusMode ? t.readerExitFocus : t.readerFocusMode}
        </button>
      </div>

      <section
        onMouseUp={() => { const text = window.getSelection()?.toString().trim() || ""; setSelectedText(text); }}
        className="flex-1 overflow-auto p-8">
        <div className="max-w-[1500px] mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 p-6 text-white shadow-2xl">
            <p className="uppercase text-sm tracking-widest opacity-80">
              {isPdfMode ? t.aiDemoLabel : t.aiKicker}
            </p>
            <h1 className="text-3xl font-black mt-2">{book}</h1>
            <p className="mt-4 text-blue-100 max-w-3xl">
              {isPdfMode
                ? `${t.aiDesc} Page ${readerPage}.`
                : t.aiDesc}
            </p>

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <p className="text-sm font-semibold text-white">{t.aiStartSession.replace(" →", "")}:</p>
              {["Student", "Teacher", "Researcher", "Exam Prep", "Elder Friendly"].map(mode => (
                <button key={mode} onClick={() => {
                  setStudyMode(mode);
                  setMessages(prev => [...prev, { type: "ai", text: t.readerModeChangedMsg.replace("{mode}", STUDY_MODE_LABELS[mode] ?? mode) }]);
                }}
                  className={studyMode === mode
                    ? "bg-green-500 text-white border-2 border-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                    : "bg-slate-800 text-white border border-slate-600 px-4 py-2 rounded-full text-sm hover:bg-blue-600"}>
                  {STUDY_MODE_LABELS[mode] ?? mode}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-5 flex-wrap">
              <span className="bg-green-500/20 border border-green-300/30 px-3 py-1 rounded-full text-xs">{t.readerTextAiReady}</span>
              <span className="bg-blue-500/20 border border-blue-300/30 px-3 py-1 rounded-full text-xs">{t.readerPageImageCaptured}</span>
              <span className="bg-yellow-500/20 border border-yellow-300/30 px-3 py-1 rounded-full text-xs">{t.readerVisionAiDemoMode}</span>
            </div>

            <div className="flex gap-3 mt-6 flex-wrap">
              <button onClick={() => addAIMessage(isPdfMode ? `Summarize the uploaded PDF content around page ${readerPage}.` : `Summarize ${activeChapter} in simple points.`)}
                className="bg-white text-black px-5 py-3 rounded-xl font-semibold">
                {t.aiSummaryBtn}
              </button>
              <button onClick={() => addAIMessage(isPdfMode ? `Explain the uploaded PDF content around page ${readerPage} for a beginner.` : `Explain ${activeChapter} for a beginner.`)}
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold">
                {t.readerExplainBtn}
              </button>
              <button onClick={() => setMessages(prev => [...prev,
                { type: "user", text: "Analyze this page image" },
                { type: "ai", text: "AI Vision Analysis: This page appears to contain educational content, structured headings, textbook formatting, and possibly diagrams or scientific terminology." },
              ])} className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold">
                {t.readerAnalyzePageImage}
              </button>
              <Link href={`/read?book=${encodeURIComponent(book)}&page=${readerPage}`}
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold">
                {t.readBtn}
              </Link>
            </div>
          </div>

          <article style={{ fontSize: readerFontSize }}
            className={darkMode
              ? "mt-8 bg-slate-900 rounded-[2rem] p-10 shadow-2xl text-slate-100 border border-slate-700"
              : "mt-8 bg-[#fffaf0] rounded-[2rem] p-10 shadow-2xl text-slate-800 border border-amber-200"}>
            <h2 className="text-4xl font-bold">
              {isPdfMode ? `${t.pages} ${readerPage}` : (CHAPTER_LABELS[activeChapter] ?? activeChapter)}
            </h2>
            <FlipBookViewer book={book} readerPage={Number(readerPage)} pdfPages={pdfPages} pageImage={pageImage} rightPageImage={rightPageImage} activeContent={activeContent}
              onPrevious={() => setReaderPage(Math.max(1, Number(readerPage) - 2))}
              onNext={() => setReaderPage(Math.min(Number(pdfPages || readerPage), Number(readerPage) + 2))}
              onAskAI={(prompt) => addAIMessage(prompt)}
              onSaveNote={saveCurrentNote} />

            {selectedText && (
              <button onClick={askAboutSelectedText} className="mt-6 bg-blue-600 text-white px-5 py-3 rounded-xl shadow">
                {t.openInChat}
              </button>
            )}

            <div className="mt-8 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                <h3 className="font-bold text-xl text-blue-900">{t.aiSummaryBtn}</h3>
                <p className="mt-3 text-slate-700 leading-8">{t.aiDesc}</p>
              </div>
              <div className="bg-slate-50 border rounded-2xl p-6">
                <h3 className="font-bold text-lg">{t.readerPageIntelligenceHeading}</h3>
                <p className="mt-4 leading-8 text-slate-700">{MODE_DESCRIPTIONS[studyMode] ?? MODE_DESCRIPTIONS.Student}</p>
                <Link href={`/read?book=${encodeURIComponent(book)}`}
                  className="inline-block mt-5 bg-blue-600 text-white px-5 py-3 rounded-xl">
                  {t.readBtn}
                </Link>
              </div>
            </div>

            <div className="mt-10 bg-yellow-100 text-black border-l-4 border-yellow-500 p-6 rounded-2xl">
              <p className="font-bold">{t.aiSummaryBtn}</p>
              <p className="mt-2">{isPdfMode ? t.pdfPreviewDesc : t.aiF1Desc}</p>
              <div className="mt-4 flex gap-3">
                <button onClick={saveCurrentNote} className="bg-black text-white px-4 py-2 rounded-xl">
                  {t.aiF2Title}
                </button>
                <button onClick={saveBookmark} className="bg-blue-600 text-white px-4 py-2 rounded-xl">
                  {t.citations}
                </button>
              </div>
            </div>
          </article>

          <div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-slate-500">{t.continueReading}</p>
                <h3 className="text-2xl font-bold mt-1">{isPdfMode ? t.readerContinuePdfTemplate.replace("{name}", pdfName || t.readerYourPdfLabel) : (CHAPTER_LABELS[activeChapter] ?? activeChapter)}</h3>
                <p className="text-sm text-slate-600 mt-2">{t.readerModeLabelPrefix} {STUDY_MODE_LABELS[studyMode] ?? studyMode} • {t.pages} {readerPage} {pdfPages ? t.readerOfTotalPages.replace("{total}", String(pdfPages)) : ""}</p>
              </div>
              <button onClick={() => addAIMessage(`Create a short learning session summary for page ${readerPage}. Include what I should revise next.`)}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl font-semibold">
                {t.readerGenerateSessionSummary}
              </button>
            </div>
          </div>

          <div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
              <div>
                <p className="text-sm text-slate-500">{t.readerSmartActionsLabel}</p>
                <h3 className="text-2xl font-bold">{t.readerModeToolsTemplate.replace("{mode}", STUDY_MODE_LABELS[studyMode] ?? studyMode)}</h3>
              </div>
              <p className="text-sm text-slate-500">{t.readerActionsChangeNote}</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              {(modeActions[studyMode] || modeActions.Student).map(([label, prompt]) => (
                <button key={label} onClick={() => addAIMessage(prompt)}
                  className="bg-slate-100 hover:bg-blue-600 hover:text-white transition px-5 py-3 rounded-2xl shadow text-sm font-semibold">
                  {ACTION_LABEL_MAP[label] ?? label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
            <h3 className="text-2xl font-bold">{t.readerLearningMemoryHeading}</h3>
            <div className="grid md:grid-cols-3 gap-4 mt-5">
              <div className="bg-slate-50 p-5 rounded-2xl">
                <p className="text-sm text-slate-500">{t.readerQuizScoreLabel}</p>
                <p className="text-3xl font-bold">{quizScore}</p>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl">
                <p className="text-sm text-slate-500">{t.readerQuizzesCompletedLabel}</p>
                <p className="text-3xl font-bold">{completedQuizzes}</p>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl">
                <p className="text-sm text-slate-500">{t.commonWeakTopics}</p>
                <p className="text-lg font-semibold">{weakTopics.length ? weakTopics.map(tp => CHAPTER_LABELS[tp] ?? tp).join(", ") : t.readerNoneLabel}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-500">{t.aiSummaryBtn}</p>
                <h3 className="text-2xl font-bold">{t.aiF3Title}</h3>
              </div>
              <button onClick={generateFlashcards} className="bg-purple-600 text-white px-5 py-3 rounded-xl">
                {t.aiF3Title}
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mt-5">
              {flashcards.length === 0 ? (
                <p className="text-slate-500">{t.searchNoResults}</p>
              ) : (
                flashcards.map((card, index) => (
                  <div key={index} className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
                    <p className="text-slate-800 leading-7">{card}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">{t.aiSummaryBtn}</p>
              <h3 className="text-xl font-bold mt-2">{t.readerKeyTakeaways}</h3>
              <p className="text-slate-600 mt-3 text-sm leading-6">
                {isPdfMode ? t.pdfPreviewDesc : t.aiF1Desc}
              </p>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">{t.readerMultilingualAiLabel}</p>
              <h3 className="text-xl font-bold mt-2">{t.readInLanguage}</h3>
              <div className="flex flex-wrap gap-2 mt-4">
                {["Hindi", "Tamil", "Bengali", "Marathi", "Telugu", "Kannada"].map(lang => (
                  <button key={lang} onClick={() => multilingualResponse(lang)}
                    className="bg-blue-100 text-blue-700 px-3 py-2 rounded-full text-xs hover:bg-blue-600 hover:text-white">
                    {t.readerExplainInLanguage.replace("{lang}", lang)}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">{t.readerPracticeLabel}</p>
              <h3 className="text-xl font-bold mt-2">{t.aiF3Title}</h3>
              <p className="text-sm text-slate-600 mt-3">
                {t.readerGenerateQuestionsFrom.replace("{source}", isPdfMode ? t.readerSourcePdfPage : t.readerSourceChapter)}
              </p>
              <button onClick={() => addAIMessage(isPdfMode ? `Create a quiz from the uploaded PDF content around page ${readerPage}.` : `Create a quiz from ${activeChapter}.`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl mt-4">
                {t.aiF3Title}
              </button>
              <button onClick={() => recordQuizResult(Math.floor(Math.random() * 100), activeChapter)}
                className="bg-green-600 text-white px-4 py-2 rounded-xl mt-3 ml-2">
                {t.readerSimulateQuizScore}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className={focusMode ? "hidden" : "w-[27%] bg-black text-white p-5 flex flex-col h-screen overflow-hidden"}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t.aiF1Title}</h2>
            <p className="text-xs text-green-400 mt-1">{t.readerActiveModeLabel.replace("{mode}", STUDY_MODE_LABELS[studyMode] ?? studyMode)}</p>
            <p className="text-xs text-gray-400">{isPdfMode ? `${t.pages} ${readerPage}` : (CHAPTER_LABELS[activeChapter] ?? activeChapter)}</p>
            <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
              className="mt-3 w-full rounded-xl bg-white px-3 py-2 text-sm text-black">
              <option>English</option>
              <option>Hindi</option>
              <option>Tamil</option>
              <option>Bengali</option>
              <option>Marathi</option>
              <option>Telugu</option>
            </select>
            <button onClick={() => {
              localStorage.removeItem("aiReaderMessages");
              localStorage.removeItem("aiSavedNotes");
              localStorage.removeItem("aiStudyMode");
              localStorage.removeItem("aiReaderPage");
              setMessages([]);
              setSavedNotes([]);
              setStudyMode("Student");
              setReaderPage(initialPage);
            }} className="mt-3 bg-red-600 text-white px-3 py-2 rounded-lg text-xs">
              {t.readerResetAiSession}
            </button>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} aria-label={t.readerToggleDarkModeAria} className="bg-white text-black w-10 h-10 rounded-full">
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="mt-5 space-y-3 flex-1 overflow-auto pr-2 min-h-0">
          {messages.map((message, index) => (
            <div key={index} className={message.type === "user"
              ? "bg-blue-600 ml-8 p-4 rounded-2xl text-sm"
              : "bg-slate-900 mr-8 p-4 rounded-2xl text-sm"}>
              <div className="whitespace-pre-wrap leading-7">
                {message.text.replaceAll("## ", "\n\n").replaceAll("### ", "\n").replaceAll("**", "")}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="bg-slate-900 p-4 rounded-2xl text-sm text-gray-300">
              {t.thinking}...
            </div>
          )}
        </div>

        <div className="mt-4 bg-slate-900 rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{t.aiF2Title}</h3>
            <div className="flex gap-2">
              <button onClick={exportNotes} className="bg-white text-black px-3 py-1 rounded-lg text-xs">{t.readerExportLabel}</button>
              <button onClick={() => setSavedNotes([])} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs">{t.readerClearLabel}</button>
            </div>
          </div>
          <div className="mt-3 space-y-2 max-h-24 overflow-auto">
            {savedNotes.length === 0 ? (
              <p className="text-xs text-gray-500">{t.searchNoResults}</p>
            ) : (
              savedNotes.map(note => (
                <div key={note.id} className="bg-black p-2 rounded-xl text-xs">
                  <p className="font-semibold text-white">{note.chapter}</p>
                  <p className="text-gray-300">{note.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={summarizeBook} className="rounded-xl bg-purple-600 px-3 py-3 text-xs font-semibold text-white hover:bg-purple-700">
            📖 {t.aiSummaryBtn}
          </button>
          <button onClick={summarizeCurrentSection} className="rounded-xl bg-indigo-600 px-3 py-3 text-xs font-semibold text-white hover:bg-indigo-700">
            📝 {t.aiF2Title}
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
            placeholder={t.chatPlaceholder}
            className="flex-1 rounded-xl px-4 py-3 bg-white text-black outline-none text-sm" />
          <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 px-5 rounded-xl text-sm">
            {t.send}
          </button>
        </div>
      </aside>
    </main>
  );
}

export default function ReaderPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  return (
    <Suspense fallback={<div className="p-10">{t.readerLoadingReaderFallback}</div>}>
      <ReaderPageContent />
    </Suspense>
  );
}
