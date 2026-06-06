"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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

type Message = {
  type: "user" | "ai";
  text: string;
};

function ReaderPageContent() {
  const searchParams = useSearchParams();

  const [pdfText, setPdfText] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfPages, setPdfPages] = useState("");
  const [pageImage, setPageImage] = useState("");
  const [question, setQuestion] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState(0);
const [completedQuizzes, setCompletedQuizzes] = useState(0);
const [weakTopics, setWeakTopics] = useState<string[]>([]);
const [flashcards, setFlashcards] = useState<string[]>([]); 
const [darkMode, setDarkMode] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [activeChapter, setActiveChapter] = useState("Introduction");
  const [isThinking, setIsThinking] = useState(false);
  const [studyMode, setStudyMode] = useState("Student");

  const initialPage = Number(searchParams.get("page") || "1");



const [readerPage, setReaderPage] = useState(initialPage);

  const book =
    searchParams.get("book") ||
    searchParams.get("pdf") ||
    pdfName ||
    "Artificial Intelligence";
    const isDemoBook = searchParams.get("demo") === "true"; 

  const isPdfMode = Boolean(pdfText);

  const activeContent = isPdfMode
    ? pdfText.slice(0, 5000)
    : chapters[activeChapter].join(" ");
    useEffect(() => {
      const history = JSON.parse(
        localStorage.getItem("readingHistory") || "[]"
      );
    
      const updated = [
        book,
        ...history.filter((item: string) => item !== book),
      ].slice(0, 10);
    
      localStorage.setItem(
        "readingHistory",
        JSON.stringify(updated)
      );
    }, [book]);
  const [messages, setMessages] = useState<Message[]>([]);
  const modeDescriptions: Record<string, string> = {
    Student:
      "This page is prepared for student-friendly learning with simple explanations, quizzes, flashcards, and revision support.",
    Teacher:
      "This page is prepared for classroom teaching with lesson plans, teaching notes, homework ideas, and discussion questions.",
    Researcher:
      "This page is prepared for deeper academic analysis, research questions, concept extraction, and critical interpretation.",
    "Exam Prep":
      "This page is prepared for exam-focused revision, likely questions, MCQs, important points, and scoring notes.",
    "Elder Friendly":
      "This page is prepared in a simpler, clearer learning style with easy language, voice-friendly explanations, and daily-life examples.",
  };
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
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("aiReaderMessages", JSON.stringify(messages));
    }
  }, [messages]);
  
  useEffect(() => {
    localStorage.setItem("aiStudyMode", studyMode);
  }, [studyMode]);
  
  useEffect(() => {
    localStorage.setItem("aiReaderPage", String(readerPage));
  }, [readerPage]);
  
  useEffect(() => {
    localStorage.setItem("aiSavedNotes", JSON.stringify(savedNotes));
  }, [savedNotes]);
  useEffect(() => {
    localStorage.setItem(
      "aiBookmarks",
      JSON.stringify(bookmarks)
    );
  }, [bookmarks]);
  useEffect(() => {
    localStorage.setItem("aiQuizScore", String(quizScore));
    localStorage.setItem(
      "aiCompletedQuizzes",
      String(completedQuizzes)
    );
    localStorage.setItem(
      "aiWeakTopics",
      JSON.stringify(weakTopics)
    );
  }, [quizScore, completedQuizzes, weakTopics]);
  useEffect(() => {
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
    
    const rawPdfText = isDemoBook
      ? demoBookContent[book] || ""
      : localStorage.getItem("uploadedPdfText") || ""; 
  
    const storedPdfText =
      rawPdfText.includes("const canvases") ||
      rawPdfText.includes("document.querySelectorAll") ||
      rawPdfText.includes("HTMLCanvasElement")
        ? ""
        : rawPdfText;
  
        const storedPdfName = isDemoBook
        ? book
        : localStorage.getItem("uploadedPdfName") || "";
      
      const storedPdfPages = isDemoBook
        ? "Demo"
        : localStorage.getItem("uploadedPdfPages") ||
          searchParams.get("pages") ||
          "";
      
      const storedPageImage =
        localStorage.getItem("uploadedPdfPageImage") || "";
      
      setPdfText(storedPdfText);
      setPdfName(storedPdfName);
      setPdfPages(storedPdfPages); 
  
    const welcomeMessage = storedPdfText
      ? `Welcome! I am your AI Tutor for ${storedPdfName || "your uploaded PDF"}.
  
  Currently analyzing page ${readerPage}.
  
  Active mode: ${studyMode}.
  
  I have access to extracted PDF text and visual page context.
  
  Choose a smart action or ask anything about this page.`
      : `Welcome! I am your AI Tutor for ${book}.
  
  Currently analyzing page ${readerPage}.
  
  Active mode: ${studyMode}.
  
  Choose a smart action or ask anything about this content.`;
  
    setMessages([
      {
        type: "ai",
        text: welcomeMessage,
      },
    ]);
  }, []);

  async function addAIMessage(questionText: string) {
    setIsThinking(true);

    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: `[Study Mode: ${studyMode}] ${questionText}`,
          book,
          chapter: isPdfMode ? `PDF Page ${readerPage}` : activeChapter,
content:
  localStorage.getItem("uploadedPdfText") ||
  activeContent,
        }),
      });

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text:
            data.answer ||
            `AI response using ${isPdfMode ? "uploaded PDF content" : activeChapter}: ${activeContent.slice(
              0,
              500
            )}...`,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          text: `Demo AI answer based on ${
            isPdfMode ? "your uploaded PDF" : activeChapter
          }: ${questionText}. This system can summarize, explain, quiz, translate, and personalize learning from real document content.`,
        },
      ]);
    }

    setIsThinking(false);
  }

  function sendMessage() {
    if (!question.trim()) return;

    const userQuestion = question;
    setMessages((prev) => [...prev, { type: "user", text: userQuestion }]);
    setQuestion("");
    addAIMessage(userQuestion);
  }

  function askAboutSelectedText() {
    if (!selectedText.trim()) return;

    setMessages((prev) => [
      ...prev,
      { type: "user", text: `Explain this: ${selectedText}` },
    ]);

    addAIMessage(`Explain this selected text in simple language: ${selectedText}`);

    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }

  function multilingualResponse(language: string) {
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        text: `Explain this content in ${language}`,
      },
      {
        type: "ai",
        text: `Demo ${language} explanation: This content can be explained in simple regional-language format for students, elderly learners, rural users, and multilingual readers. In production, this will connect to multilingual AI translation and tutoring.`,
      },
    ]);
  }
  function saveBookmark() {
    const bookmark =
      isPdfMode
        ? `${book} - PDF Page ${readerPage}`
        : `${book} - ${activeChapter}`;
  
    setBookmarks((prev) =>
      prev.includes(bookmark)
        ? prev
        : [...prev, bookmark]
    );
  
    setMessages((prev) => [
      ...prev,
      {
        type: "ai",
        text: `Bookmark saved: ${bookmark}`,
      },
    ]);
  }
  function saveCurrentNote() {
    setSavedNotes((prev) => [
      ...prev,
      isPdfMode
        ? `PDF Page ${readerPage}: ${activeContent.slice(0, 250)}...`
        : `${activeChapter}: ${chapters[activeChapter][0]}`,
    ]);
  }
  function generateFlashcards() {
    const sourceText = activeContent.slice(0, 600);
  
    const cards = [
      `What is the main idea? → ${sourceText.slice(0, 120)}...`,
      `Key concept → ${isPdfMode ? "PDF page content" : activeChapter}`,
      `Revision prompt → Explain this topic in your own words.`,
    ];
  
    setFlashcards(cards);
  
    setMessages((prev) => [
      ...prev,
      {
        type: "ai",
        text: "Flashcards generated and added to your learning memory.",
      },
    ]);
  }
  function recordQuizResult(
    score: number,
    topic: string
  ) {
    setQuizScore((prev) => prev + score);
    setCompletedQuizzes((prev) => prev + 1);
  
    if (score < 60) {
      setWeakTopics((prev) =>
        prev.includes(topic)
          ? prev
          : [...prev, topic]
      );
    }
  
    setMessages((prev) => [
      ...prev,
      {
        type: "ai",
        text: `Quiz recorded. Score: ${score}%. ${
          score < 60
            ? `Added "${topic}" to revision list.`
            : "Good performance."
        }`,
      },
    ]);
  }
  function exportNotes() {
    const notesText = savedNotes.length
      ? savedNotes.join("\n\n")
      : "No saved notes yet.";

    const blob = new Blob([notesText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${book}-notes.txt`;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main
      className={
        darkMode
          ? "h-screen flex bg-slate-950 text-white overflow-hidden"
          : "h-screen flex bg-slate-100 text-slate-900 overflow-hidden"
      }
    >
      <aside className="w-72 bg-slate-950 text-white p-6 overflow-auto border-r border-white/10">
        <Link href="/" className="text-blue-400 font-semibold">
          ← Back to Library
        </Link>

        <h2 className="text-3xl font-bold mt-8">AI Reader</h2>

        <p className="text-slate-400 mt-2 text-sm">
          {isPdfMode ? "PDF-aware AI learning workspace." : "Smart multilingual learning workspace."}
        </p>

        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {isPdfMode ? "PDF Context" : "Chapters"}
          </p>

          {isPdfMode ? (
            <div className="mt-4 bg-slate-900 rounded-2xl p-4">
              <p className="font-bold break-words">{pdfName || book}</p>
              <p className="text-xs text-slate-400 mt-2">
              Page: {readerPage}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Pages: {pdfPages || "Detected after upload"}
              </p>
              <p className="text-xs text-green-400 mt-3">
  PDF text loaded for AI analysis
</p>

<p className={pageImage ? "text-xs text-green-400 mt-2" : "text-xs text-yellow-400 mt-2"}>
  {pageImage ? "Visual page captured for AI" : "Visual page not captured yet"}
</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {Object.keys(chapters).map((chapter) => (
                <button
                  key={chapter}
                  onClick={() => setActiveChapter(chapter)}
                  className={
                    activeChapter === chapter
                      ? "w-full text-left bg-blue-600 p-4 rounded-2xl shadow-lg"
                      : "w-full text-left bg-slate-900 hover:bg-slate-800 p-4 rounded-2xl transition"
                  }
                >
                  {chapter}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 bg-slate-900 p-5 rounded-3xl">
          <p className="text-sm font-bold">Learning Progress</p>

          <div className="w-full bg-slate-700 h-3 rounded-full mt-4">
            <div className="bg-blue-500 h-3 rounded-full w-[58%]" />
          </div>

          <p className="text-xs text-slate-400 mt-3">
            58% of this learning session completed
          </p>
        </div>
      </aside>

      <section
        onMouseUp={() => {
          const text = window.getSelection()?.toString().trim() || "";
          setSelectedText(text);
        }}
        className="flex-1 overflow-auto p-8"
      >
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-purple-700 p-10 text-white shadow-2xl">
            <p className="uppercase text-sm tracking-widest opacity-80">
              {isPdfMode ? "AI analyzing uploaded PDF" : "AI-powered learning mode"}
            </p>

            <h1 className="text-5xl font-bold mt-3">{book}</h1>

            <p className="mt-4 text-blue-100 max-w-3xl">
              {isPdfMode
                ? `AI is using extracted PDF text and currently focusing on page ${readerPage}.`
                : "Ask questions, summarize chapters, translate into Indian languages, generate quizzes, save notes, and learn in a personalized way."}
            </p>
            <div className="mt-6 flex items-center gap-3 flex-wrap">
  <p className="text-sm font-semibold text-white">
    Study Mode:
  </p>

  {[
    "Student",
    "Teacher",
    "Researcher",
    "Exam Prep",
    "Elder Friendly",
  ].map((mode) => (
    <button
      key={mode}
      onClick={() => {
        setStudyMode(mode);
      
        setMessages((prev) => [
          ...prev,
          {
            type: "ai",
            text: `Study mode changed to ${mode}.`,
          },
        ]);
      }}
      className={
        studyMode === mode
          ? "bg-green-500 text-white border-2 border-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
          : "bg-slate-800 text-white border border-slate-600 px-4 py-2 rounded-full text-sm hover:bg-blue-600"
      }
    >
      {mode}
    </button>
  ))}
</div>
            <div className="flex gap-2 mt-5 flex-wrap">
  <span className="bg-green-500/20 border border-green-300/30 px-3 py-1 rounded-full text-xs">
    Text AI Ready
  </span>
  <span className="bg-blue-500/20 border border-blue-300/30 px-3 py-1 rounded-full text-xs">
    Page Image Captured
  </span>
  <span className="bg-yellow-500/20 border border-yellow-300/30 px-3 py-1 rounded-full text-xs">
    Vision AI Demo Mode
  </span>
</div>
            <div className="flex gap-3 mt-6 flex-wrap">
              <button
                onClick={() =>
                  addAIMessage(
                    isPdfMode
                      ? `Summarize the uploaded PDF content around page ${readerPage}.`
                      : `Summarize ${activeChapter} in simple points.`
                  )
                }
                className="bg-white text-black px-5 py-3 rounded-xl font-semibold"
              >
                Summarize
              </button>

              <button
                onClick={() =>
                  addAIMessage(
                    isPdfMode
                      ? `Explain the uploaded PDF content around page ${readerPage} for a beginner.`
                      : `Explain ${activeChapter} for a beginner.`
                  )
                }
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold"
              >
                Explain Simply
              </button>
              <button
  onClick={() =>
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        text: "Analyze this page image",
      },
      {
        type: "ai",
        text:
          "AI Vision Analysis: This page appears to contain educational content, structured headings, textbook formatting, and possibly diagrams or scientific terminology. Future multimodal AI upgrades will support diagram understanding, graph interpretation, equations, handwritten notes, and visual learning assistance.",
      },
    ])
  }
  className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold"
>
  Analyze Page Image
</button>

              <Link
                href={`/read?book=${encodeURIComponent(book)}&page=${readerPage}`}
                className="bg-black/30 border border-white/20 px-5 py-3 rounded-xl font-semibold"
              >
                Classic Read Mode
              </Link>
            </div>
          </div>
          <div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div>
      <p className="text-sm text-slate-500">Continue Learning</p>
      <h3 className="text-2xl font-bold mt-1">
        {isPdfMode ? `Continue ${pdfName || "your PDF"}` : activeChapter}
      </h3>
      <p className="text-sm text-slate-600 mt-2">
        Mode: {studyMode} • Page {readerPage} {pdfPages ? `of ${pdfPages}` : ""}
      </p>
    </div>

    <button
      onClick={() =>
        addAIMessage(
          `Create a short learning session summary for page ${readerPage}. Include what I should revise next.`
        )
      }
      className="bg-blue-600 text-white px-5 py-3 rounded-xl font-semibold"
    >
      Generate Session Summary
    </button>
  </div>
</div>
<div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
  <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
    <div>
      <p className="text-sm text-slate-500">Smart Actions</p>
      <h3 className="text-2xl font-bold">
        {studyMode} Mode Tools
      </h3>
    </div>

    <p className="text-sm text-slate-500">
      Actions change based on selected learning mode
    </p>
  </div>

  <div className="flex gap-3 flex-wrap">
    {(modeActions[studyMode] || modeActions.Student).map(([label, prompt]) => (
      <button
        key={label}
        onClick={() => addAIMessage(prompt)}
        className="bg-slate-100 hover:bg-blue-600 hover:text-white transition px-5 py-3 rounded-2xl shadow text-sm font-semibold"
      >
        {label}
      </button>
    ))}
  </div>
</div>
<div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
  <h3 className="text-2xl font-bold">
    Learning Memory
  </h3>

  <div className="grid md:grid-cols-3 gap-4 mt-5">
    <div className="bg-slate-50 p-5 rounded-2xl">
      <p className="text-sm text-slate-500">
        Quiz Score
      </p>
      <p className="text-3xl font-bold">
        {quizScore}
      </p>
    </div>

    <div className="bg-slate-50 p-5 rounded-2xl">
      <p className="text-sm text-slate-500">
        Quizzes Completed
      </p>
      <p className="text-3xl font-bold">
        {completedQuizzes}
      </p>
    </div>

    <div className="bg-slate-50 p-5 rounded-2xl">
      <p className="text-sm text-slate-500">
        Weak Topics
      </p>
      <p className="text-lg font-semibold">
        {weakTopics.length
          ? weakTopics.join(", ")
          : "None"}
      </p>
    </div>
  </div>
</div>
<div className="mt-8 bg-white rounded-3xl p-6 shadow-lg border">
  <div className="flex justify-between items-center">
    <div>
      <p className="text-sm text-slate-500">AI Flashcards</p>
      <h3 className="text-2xl font-bold">Revision Cards</h3>
    </div>

    <button
      onClick={generateFlashcards}
      className="bg-purple-600 text-white px-5 py-3 rounded-xl"
    >
      Generate Flashcards
    </button>
  </div>

  <div className="grid md:grid-cols-3 gap-4 mt-5">
    {flashcards.length === 0 ? (
      <p className="text-slate-500">
        No flashcards generated yet.
      </p>
    ) : (
      flashcards.map((card, index) => (
        <div
          key={index}
          className="bg-purple-50 border border-purple-200 rounded-2xl p-5"
        >
          <p className="text-slate-800 leading-7">
            {card}
          </p>
        </div>
      ))
    )}
  </div>
</div>
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">AI Summary</p>
              <h3 className="text-xl font-bold mt-2">Key Takeaways</h3>
              <p className="text-slate-600 mt-3 text-sm leading-6">
                {isPdfMode
                  ? "The AI reader has received extracted text from your uploaded PDF and can now answer questions based on that document."
                  : "This chapter explains how AI-enabled digital libraries can turn passive reading into guided, personalized learning."}
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">Multilingual AI</p>
              <h3 className="text-xl font-bold mt-2">Explain in Indian Languages</h3>

              <div className="flex flex-wrap gap-2 mt-4">
                {["Hindi", "Tamil", "Bengali", "Marathi", "Telugu", "Kannada"].map(
                  (language) => (
                    <button
                      key={language}
                      onClick={() => multilingualResponse(language)}
                      className="bg-blue-100 text-blue-700 px-3 py-2 rounded-full text-xs hover:bg-blue-600 hover:text-white"
                    >
                      {language}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg">
              <p className="text-sm text-slate-500">Practice</p>
              <h3 className="text-xl font-bold mt-2">Quick Quiz</h3>
              <p className="text-sm text-slate-600 mt-3">
                Generate questions from this {isPdfMode ? "PDF page" : "chapter"}.
              </p>

              <button
                onClick={() =>
                  addAIMessage(
                    isPdfMode
                      ? `Create a quiz from the uploaded PDF content around page ${readerPage}.`
                      : `Create a quiz from ${activeChapter}.`
                  )
                }
                className="bg-blue-600 text-white px-4 py-2 rounded-xl mt-4"
              >
                Generate Quiz
              </button>
              <button
  onClick={() =>
    recordQuizResult(
      Math.floor(Math.random() * 100),
      activeChapter
    )
  }
  className="bg-green-600 text-white px-4 py-2 rounded-xl mt-3 ml-2"
>
  Simulate Quiz Score
</button>
            </div>
          </div>

          <article
            className={
              darkMode
                ? "mt-8 bg-slate-900 rounded-3xl p-10 shadow-xl text-slate-100"
                : "mt-8 bg-white rounded-3xl p-10 shadow-xl text-slate-800"
            }
          >
            <h2 className="text-4xl font-bold">
              {isPdfMode ? `PDF Page ${readerPage} AI Context` : activeChapter}
            </h2>
            {isPdfMode && (
  <div className="flex items-center gap-4 mt-6 flex-wrap">
    <button
      onClick={() => {
        const previous = Math.max(1, Number(readerPage) - 1);

        setReaderPage(previous);

        const image =
  localStorage.getItem(`uploadedPdfPageImage_${previous}`) || "";

setPageImage(image);

if (!image) {
  setMessages((prev) => [
    ...prev,
    {
      type: "ai",
      text: `Page ${previous} image is not captured yet. Go back to Classic Read Mode, open page ${previous}, then click Ask AI About This Page.`,
    },
  ]);
}
      }}
      className="bg-slate-900 text-white px-5 py-3 rounded-xl"
    >
      ← Previous
    </button>

    <div className="bg-slate-100 px-5 py-3 rounded-xl text-sm font-semibold">
      Page {readerPage} of {pdfPages || "?"}
    </div>

    <button
      onClick={() => {
        const next = Math.min(
          Number(pdfPages || readerPage),
          Number(readerPage) + 1
        );

        setReaderPage(next);

        const image =
        localStorage.getItem(`uploadedPdfPageImage_${next}`) || "";
      
      setPageImage(image);
      
      if (!image) {
        setMessages((prev) => [
          ...prev,
          {
            type: "ai",
            text: `Page ${next} image is not captured yet. Go back to Classic Read Mode, open page ${next}, then click Ask AI About This Page.`,
          },
        ]);
      }
      }}
      className="bg-blue-600 text-white px-5 py-3 rounded-xl"
    >
      Next →
    </button>
  </div>
)}

            {selectedText && (
              <button
                onClick={askAboutSelectedText}
                className="mt-6 bg-blue-600 text-white px-5 py-3 rounded-xl shadow"
              >
                Ask AI about selected text
              </button>
            )}
{pageImage && (
  <div className="mt-8 bg-white rounded-3xl p-5 shadow-xl border">
    <h3 className="text-2xl font-bold text-slate-900">
      Original PDF Page
    </h3>

    <p className="text-sm text-slate-500 mt-2">
      AI can use this visual page for future diagram and image understanding.
    </p>

    <img
      src={pageImage}
      alt="PDF Page"
      className="mt-5 rounded-2xl border shadow max-h-[900px] object-contain w-full"
    />
  </div>
)}

<div className="space-y-6">
  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
    <h3 className="font-bold text-xl text-blue-900">
      AI Summary
    </h3>

    <p className="mt-3 text-slate-700 leading-8">
      This PDF page has been processed and prepared for AI-assisted learning.
      You can ask for summaries, explanations, quizzes, translations,
      flashcards, research help, and concept clarification.
    </p>
  </div>

  <div className="bg-slate-50 border rounded-2xl p-6">
  <h3 className="font-bold text-lg">
  Page Intelligence
</h3>

<p className="mt-4 leading-8 text-slate-700">
{modeDescriptions[studyMode]}
</p>

<Link
  href={`/read?book=${encodeURIComponent(book)}`}
  className="inline-block mt-5 bg-blue-600 text-white px-5 py-3 rounded-xl"
>
Open This Page in Classic Reader
</Link>
  </div>
</div>
            <div className="mt-10 bg-yellow-100 text-black border-l-4 border-yellow-500 p-6 rounded-2xl">
              <p className="font-bold">Highlighted by AI</p>

              <p className="mt-2">
                {isPdfMode
                  ? "AI has loaded this PDF text and can summarize, simplify, translate, and generate quizzes from it."
                  : "AI-first libraries combine reading, tutoring, notes, quizzes, and revision into one experience."}
              </p>

              <button
                onClick={saveCurrentNote}
                className="mt-4 bg-black text-white px-4 py-2 rounded-xl"
              >
                Save as Note
                <button
  onClick={saveBookmark}
  className="mt-3 ml-3 bg-blue-600 text-white px-4 py-2 rounded-xl"
>
  Bookmark Page
</button>
              </button>
            </div>
          </article>
        </div>
      </section>

      <aside className="w-[32%] bg-black text-white p-5 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">AI Tutor</h2>
            <p className="text-xs text-green-400 mt-1">
  Active Mode: {studyMode}
</p>
            <p className="text-xs text-gray-400">
              Context: {isPdfMode ? `PDF Page ${readerPage}` : activeChapter}
            </p>
            <button
  onClick={() => {
    localStorage.removeItem("aiReaderMessages");
    localStorage.removeItem("aiSavedNotes");
    localStorage.removeItem("aiStudyMode");
    localStorage.removeItem("aiReaderPage");
    setMessages([]);
    setSavedNotes([]);
    setStudyMode("Student");
    setReaderPage(initialPage);
  }}
  className="mt-3 bg-red-600 text-white px-3 py-2 rounded-lg text-xs"
>
  Reset AI Session
</button>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="bg-white text-black w-10 h-10 rounded-full"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>

        

        <div className="mt-5 space-y-3 flex-1 overflow-auto pr-2 min-h-0">
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.type === "user"
                  ? "bg-blue-600 ml-8 p-4 rounded-2xl text-sm"
                  : "bg-slate-900 mr-8 p-4 rounded-2xl text-sm"
              }
            >
              {message.text}
            </div>
          ))}

          {isThinking && (
            <div className="bg-slate-900 p-4 rounded-2xl text-sm text-gray-300">
              AI is thinking...
            </div>
          )}
        </div>
       

        <div className="mt-4 bg-slate-900 rounded-3xl p-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Saved Notes</h3>

            <div className="flex gap-2">
              <button
                onClick={exportNotes}
                className="bg-white text-black px-3 py-1 rounded-lg text-xs"
              >
                Export
              </button>

              <button
                onClick={() => setSavedNotes([])}
                className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-24 overflow-auto">
            {savedNotes.length === 0 ? (
              <p className="text-xs text-gray-500">No saved notes yet.</p>
            ) : (
              savedNotes.map((note, index) => (
                <div key={index} className="bg-black p-2 rounded-xl text-xs">
                  {note}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Ask AI anything..."
            className="flex-1 rounded-xl px-4 py-3 bg-white text-black outline-none text-sm"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-700 px-5 rounded-xl text-sm"
          >
            Send
          </button>
        </div>
      </aside>

      <button
        onClick={() =>
          setMessages((prev) => [
            ...prev,
            {
              type: "ai",
              text: "Floating AI Assistant opened. Ask me anything about this book, PDF, page, summary, quiz, translation, or learning path.",
            },
          ])
        }
        className="fixed bottom-8 right-8 bg-blue-600 text-white w-16 h-16 rounded-full shadow-2xl text-3xl hover:scale-110 transition"
      >
        🤖
      </button>
    </main>
  );
}
export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="p-10">Loading Reader...</div>}>
      <ReaderPageContent />
    </Suspense>
  );
}