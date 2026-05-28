"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import Tesseract from "tesseract.js";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const Document = dynamic(
  () => import("react-pdf").then((mod) => mod.Document),
  { ssr: false }
);

const Page = dynamic(
  () => import("react-pdf").then((mod) => mod.Page),
  { ssr: false }
);

export default function ReadPage() {
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const [zoom, setZoom] = useState(1.1);
  const [speechRate, setSpeechRate] = useState(1);
  const [lastCommand, setLastCommand] = useState("No command yet");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAiReady, setIsAiReady] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [needsAutoScan, setNeedsAutoScan] = useState(false);
  const [hasScannedPage, setHasScannedPage] = useState(false);
  const [demoBook, setDemoBook] = useState("");
  const demoPages: Record<string, string[]> = {
    "Artificial Intelligence": [
      "Artificial Intelligence introduces systems capable of simulating human intelligence. Modern AI combines machine learning, reasoning, natural language processing, and adaptive learning.",
      
      "Machine learning allows systems to improve automatically from data. Neural networks and transformers are widely used in modern AI systems.",
      
      "AI is transforming healthcare, education, finance, transportation, agriculture, and scientific research across the world.",
  
      "Ethical AI focuses on fairness, transparency, privacy, bias reduction, and responsible deployment of intelligent systems.",
    ],
  
    "Machine Learning": [
      "Machine Learning enables computers to learn patterns from datasets without explicit programming.",
      
      "Supervised learning uses labeled data for prediction tasks, while unsupervised learning finds hidden structures.",
      
      "Deep learning uses neural networks with multiple layers to solve advanced AI problems.",
    ],
  };
  useEffect(() => {
    async function setupPdfWorker() {
      const { pdfjs } = await import("react-pdf");
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }

    setupPdfWorker();
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
  
    if (book) {
      setDemoBook(book);
      setPdfName(book);
      localStorage.setItem("demoBookTitle", book);
    }
  }, []);
  useEffect(() => {
    if (!pdfFile) return;
    if (numPages === 0) return;
    if (!needsAutoScan) return;
    if (isRunningOcr) return;
    if (hasScannedPage) return;

    const timer = setTimeout(() => {
      runOCR(true);
    }, 6000);

    return () => clearTimeout(timer);
  }, [pdfFile, numPages, needsAutoScan, isRunningOcr, hasScannedPage]);
  const currentDemoPages = demoPages[demoBook] || [];

  const totalDemoPages =
    currentDemoPages.length > 0
      ? currentDemoPages.length
      : 1;
  const readingText =
    ocrText ||
    "This is the classic reading mode. Users can read PDF books, zoom pages, use fullscreen, listen to content, and navigate pages.";

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
      setNumPages(numPages);
      setPage(1);
      localStorage.setItem("uploadedPdfPages", String(numPages));
    }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setPdfName(file.name);
    setIsAiReady(false);
    setOcrText("");
    setNeedsAutoScan(false);
    setHasScannedPage(false);

    localStorage.removeItem("uploadedPdfText");
    localStorage.removeItem("uploadedPdfName");
    localStorage.removeItem("uploadedPdfPages");

    localStorage.setItem("uploadedPdfName", file.name);
    setPdfFile(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("file", file);

    setIsExtracting(true);

    try {
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      const extractedText = data.text || "";

      localStorage.setItem(
        "uploadedPdfPages",
        String(data.pages || numPages || "")
      );

      if (extractedText.trim().length >= 20) {
        localStorage.setItem("uploadedPdfText", extractedText);
        setIsAiReady(true);
        setNeedsAutoScan(false);
      } else {
        localStorage.setItem(
          "uploadedPdfText",
          `Uploaded PDF: ${file.name}. This appears to be scanned or image-based. The system is scanning the visible page automatically.`
        );
        setIsAiReady(false);
        setNeedsAutoScan(true);
      }
    } catch (error) {
      console.error("PDF extraction failed", error);

      localStorage.setItem(
        "uploadedPdfText",
        `Uploaded PDF: ${file.name}. Text extraction failed. The system is scanning the visible page automatically.`
      );

      setIsAiReady(false);
      setNeedsAutoScan(true);
    } finally {
      setIsExtracting(false);
    }
  }

  async function runOCR(auto = false) {
    if (!pdfFile) return;

    try {
      setIsRunningOcr(true);
      setHasScannedPage(true);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const canvases = Array.from(document.querySelectorAll("canvas"));

      const canvas = canvases.reduce((largest, current) => {
        if (!largest) return current;

        const largestArea = largest.width * largest.height;
        const currentArea = current.width * current.height;

        return currentArea > largestArea ? current : largest;
      }, null as HTMLCanvasElement | null);

      if (!canvas) {
        localStorage.setItem(
          "uploadedPdfText",
          `Uploaded PDF: ${pdfName}. Scan could not find the visible page image.`
        );
        setIsAiReady(true);
        setNeedsAutoScan(false);
        return;
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png");
      });

      if (!blob) {
        localStorage.setItem(
          "uploadedPdfText",
          `Uploaded PDF: ${pdfName}. Scan could not prepare the page image.`
        );
        setIsAiReady(true);
        setNeedsAutoScan(false);
        return;
      }

      const result = await Tesseract.recognize(blob, "eng+hin", {
        logger: (m) => console.log(m),
      });

      const extracted = result.data.text.trim();

      if (!extracted) {
        localStorage.setItem(
          "uploadedPdfText",
          `Uploaded PDF: ${pdfName}. Automatic scan completed, but no readable text was found on this page.`
        );
        setIsAiReady(true);
        setNeedsAutoScan(false);
        return;
      }

      setOcrText(extracted);
      localStorage.setItem("uploadedPdfText", extracted);
      localStorage.setItem("uploadedPdfName", pdfName || "Scanned PDF Page");

      setIsAiReady(true);
      setNeedsAutoScan(false);
      setHasScannedPage(true);

      if (!auto) {
        alert("Page scan completed successfully.");
      }
    } catch (error) {
      console.error("OCR failed", error);

      localStorage.setItem(
        "uploadedPdfText",
        `Uploaded PDF: ${pdfName}. Automatic page scan failed. Please try Retry Page Scan.`
      );

      setIsAiReady(true);
      setNeedsAutoScan(false);
      setHasScannedPage(true);

      if (!auto) {
        alert("Page scan failed.");
      }
    } finally {
      setIsRunningOcr(false);
    }
  }
  async function openAIReader() {
    try {
      const canvases = Array.from(document.querySelectorAll("canvas"));
  
      const canvas = canvases.reduce((largest, current) => {
        if (!largest) return current;
  
        const largestArea = largest.width * largest.height;
        const currentArea = current.width * current.height;
  
        return currentArea > largestArea ? current : largest;
      }, null as HTMLCanvasElement | null);
  
      if (canvas) {
        const image = canvas.toDataURL("image/png");
        localStorage.setItem("uploadedPdfPageImage", image);
localStorage.setItem(`uploadedPdfPageImage_${page}`, image);
localStorage.setItem("uploadedPdfCurrentPage", String(page));
      }
  
      window.location.href = `/reader?pdf=${encodeURIComponent(
        pdfName || "Uploaded PDF"
      )}&page=${page}&pages=${numPages || 1}`;
    } catch (error) {
      console.error("Failed to open AI reader", error);
  
      window.location.href = `/reader?pdf=${encodeURIComponent(
        pdfName || "Uploaded PDF"
      )}&page=${page}&pages=${numPages || 1}`; 
    }
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  function readAloud() {
    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(readingText);
    speech.rate = speechRate;
    speech.pitch = 1;
    speech.volume = 1;

    window.speechSynthesis.speak(speech);
  }

  function pauseReading() {
    window.speechSynthesis.pause();
  }

  function resumeReading() {
    window.speechSynthesis.resume();
  }

  function stopReading() {
    window.speechSynthesis.cancel();
  }

  function startVoiceCommands() {
    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice commands are not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const command = event.results[0][0].transcript.toLowerCase();
      setLastCommand(command);

      if (command.includes("next")) {
        setPage((prev) => Math.min(numPages || 1, prev + 1));
      } else if (command.includes("previous") || command.includes("back")) {
        setPage((prev) => Math.max(1, prev - 1));
      } else if (command.includes("zoom in")) {
        setZoom((prev) => Math.min(1.8, prev + 0.1));
      } else if (command.includes("zoom out")) {
        setZoom((prev) => Math.max(0.7, prev - 0.1));
      } else if (command.includes("read aloud")) {
        readAloud();
      } else if (command.includes("stop")) {
        stopReading();
      } else if (command.includes("dark")) {
        setDarkMode(true);
      } else if (command.includes("light")) {
        setDarkMode(false);
      } else if (command.includes("open ai")) {
        window.location.href = `/reader?pdf=${encodeURIComponent(
          pdfName || "Uploaded PDF"
        )}&page=${page}`;
      } else {
        alert(`Command heard: "${command}"`);
      }
    };

    recognition.start();
  }

  return (
    <main
      className={`min-h-screen ${
        darkMode ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-900"
      }`}
    >
      <header className="sticky top-0 z-50 bg-white/90 text-slate-900 backdrop-blur-xl border-b px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Classic PDF Reader</h1>
          <p className="text-xs text-slate-500">
            Page {page} {numPages ? `of ${numPages}` : ""}
            {isExtracting ? " • Reading text..." : ""}
            {isRunningOcr ? " • Scanning page..." : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="px-4 py-2 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200">
            Upload PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setZoom(Math.min(1.8, zoom + 0.1))}
            className="px-4 py-2 bg-slate-100 rounded-xl"
          >
            Zoom +
          </button>

          <button
            onClick={() => setZoom(Math.max(0.7, zoom - 0.1))}
            className="px-4 py-2 bg-slate-100 rounded-xl"
          >
            Zoom -
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="px-4 py-2 bg-black text-white rounded-xl"
          >
            {darkMode ? "Light" : "Dark"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl"
          >
            ⛶ Fullscreen
          </button>

          <button
  onClick={openAIReader}
  className="px-4 py-2 bg-purple-600 text-white rounded-xl"
>
  Ask AI About This Page
</button>
        </div>
      </header>

      {pdfName && (
        <div className="mx-8 mt-6 bg-green-50 border-2 border-green-500 rounded-2xl shadow p-5 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-900">📄 {pdfName}</p>

            
            <p className="text-sm text-slate-500 mt-1">
              {isRunningOcr
                ? "Scanning book page automatically..."
                : isExtracting
                ? "Reading book text..."
                : isAiReady
                ? "Book processed • Ready for AI analysis"
                : "Preparing book for AI analysis..."}
            </p>
          </div>

          <div
            className={
              isAiReady
                ? "bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold"
                : "bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-semibold"
            }
          >
            {isAiReady ? "AI Ready" : "Processing"}
          </div>
        </div>
      )}

      <div className="flex">
        <aside className="w-72 p-5 border-r min-h-screen bg-white/80 text-slate-900 overflow-auto">
          <h2 className="font-bold mb-4">Page Thumbnails</h2>

          {pdfFile && numPages > 0 ? (
            <Document file={pdfFile}>
              {Array.from({ length: numPages }, (_, index) => index + 1)
                .slice(0, 20)
                .map((item) => (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`w-full border rounded-2xl mb-4 p-2 shadow-sm ${
                      page === item
                        ? "bg-blue-100 border-blue-500"
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    <div className="flex justify-center overflow-hidden rounded-xl bg-white">
                      <Page
                        pageNumber={item}
                        width={140}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </div>

                    <p className="text-xs mt-2">Page {item}</p>
                  </button>
                ))}
            </Document>
          ) : (
            <p className="text-sm text-slate-500">
              Upload a PDF to see page thumbnails.
            </p>
          )}
        </aside>

        <section className="flex-1 p-8">
          <div className="flex justify-center">
            <div
              className={`rounded-3xl shadow-2xl p-6 ${
                darkMode ? "bg-slate-900" : "bg-white"
              }`}
            >
              {pdfFile ? (
                <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
                  <Page pageNumber={page} scale={zoom} />
                </Document>
              ) : (
                <div className="w-[720px] min-h-[780px] flex flex-col items-center justify-center text-center p-10">
                  <h2 className="text-4xl font-bold">
                    {demoBook ? demoBook : "Upload a PDF Book"}
                  </h2>
              
                  <p className="mt-4 text-slate-500 max-w-xl leading-8">
                    {demoBook
                      ? "Classic reading mode with realistic page reading, AI tutoring, summaries, multilingual explanations, notes, and quizzes."
                      : "This reader supports real PDF books with page navigation, zoom, fullscreen, voice reading, accessibility controls, automatic scanning, and AI page analysis."}
                  </p>
              
                  {demoBook ? (
                    <>
                     <div className="mt-10 bg-gradient-to-br from-amber-50 to-orange-100 border rounded-3xl shadow-2xl max-w-3xl text-left overflow-hidden">
  <div className="bg-gradient-to-r from-orange-700 to-amber-600 text-white px-8 py-5">
    <p className="uppercase tracking-[0.3em] text-xs opacity-80">
      Classic Reading Mode
    </p>

    <h3 className="text-3xl font-bold mt-2">
      {demoBook}
    </h3>

    <p className="text-sm opacity-80 mt-1">
      Page {page} of {totalDemoPages}
    </p>
  </div>

  <div className="p-10 min-h-[420px] bg-[#fffdf8]">
    <p className="text-slate-800 text-xl leading-[2.3] tracking-wide font-serif">
      {currentDemoPages[page - 1] ||
        "This demo page is currently unavailable."}
    </p>
  </div>

  <div className="border-t bg-white px-8 py-5 flex justify-between items-center">
    <button
      onClick={() => setPage(Math.max(1, page - 1))}
      className="bg-slate-100 px-6 py-3 rounded-xl hover:bg-slate-200"
    >
      ← Previous Page
    </button>

    <div className="text-sm text-slate-500">
      Reading Progress:{" "}
      {Math.round((page / totalDemoPages) * 100)}%
    </div>

    <button
      onClick={() =>
        setPage(Math.min(totalDemoPages, page + 1))
      }
      className="bg-slate-900 text-white px-6 py-3 rounded-xl hover:bg-black"
    >
      Next Page →
    </button>
  </div>
</div> 
              
                      <Link
                        href={`/reader?book=${encodeURIComponent(demoBook)}&demo=true`}
                        className="mt-8 bg-purple-600 text-white px-8 py-4 rounded-2xl"
                      >
                        Ask AI About This Book
                      </Link>
                    </>
                  ) : (
                    <label className="mt-8 bg-blue-600 text-white px-8 py-4 rounded-2xl cursor-pointer">
                      Choose PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                            )}
                            </div>
                          </div>

      

          <div className="mt-8 bg-white text-slate-900 rounded-2xl p-5 shadow flex items-center gap-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              className="px-5 py-3 bg-slate-100 rounded-xl"
            >
              ← Previous
            </button>

            <input
              type="range"
              min="1"
              max={numPages || 1}
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="flex-1"
              disabled={!numPages}
            />

            <button
              onClick={() => setPage(Math.min(numPages || 1, page + 1))}
              className="px-5 py-3 bg-slate-100 rounded-xl"
            >
              Next →
            </button>

            <span className="text-sm text-slate-500">
              {numPages
                ? `${Math.round((page / numPages) * 100)}% completed`
                : "0% completed"}
            </span>
          </div>

          <div className="mt-6 bg-slate-900 text-white rounded-2xl p-5 shadow flex items-center gap-4 flex-wrap">
            <h3 className="font-bold mr-4">Accessibility & Voice Controls</h3>

            <button
              onClick={readAloud}
              className="bg-green-600 px-4 py-3 rounded-xl"
            >
              🔊 Read Aloud
            </button>

            <button
              onClick={pauseReading}
              className="bg-yellow-500 px-4 py-3 rounded-xl"
            >
              ⏸ Pause
            </button>

            <button
              onClick={resumeReading}
              className="bg-blue-600 px-4 py-3 rounded-xl"
            >
              ▶ Resume
            </button>

            <button
              onClick={stopReading}
              className="bg-red-600 px-4 py-3 rounded-xl"
            >
              ■ Stop
            </button>

            <button
              onClick={startVoiceCommands}
              className="bg-purple-600 px-4 py-3 rounded-xl"
            >
              🎙 Voice Commands
            </button>

            {pdfFile && (
              <button
                onClick={() => runOCR(false)}
                disabled={isRunningOcr}
                className="bg-orange-600 px-4 py-3 rounded-xl disabled:opacity-60"
              >
                {isRunningOcr ? "Scanning..." : "↻ Retry Page Scan"}
              </button>
            )}

            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Speed</label>

              <select
                value={speechRate}
                onChange={(e) => setSpeechRate(Number(e.target.value))}
                className="bg-white text-black rounded-xl px-3 py-2 border border-slate-300 shadow"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
              </select>
            </div>

            <p className="text-sm text-slate-300 w-full">
              Last voice command: {lastCommand}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}