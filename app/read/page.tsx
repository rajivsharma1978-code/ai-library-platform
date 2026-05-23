"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

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

  useEffect(() => {
    async function setupPdfWorker() {
      const { pdfjs } = await import("react-pdf");
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }

    setupPdfWorker();
  }, []);

  const readingText =
    "This is the classic reading mode. Users can read PDF books, zoom pages, use fullscreen, listen to content, and navigate pages.";

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPage(1);
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setPdfName(file.name);
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

      localStorage.setItem("uploadedPdfText", data.text || "");
      localStorage.setItem("uploadedPdfPages", String(data.pages || ""));
    } catch (error) {
      console.error("PDF extraction failed", error);
    } finally {
      setIsExtracting(false);
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
            {isExtracting ? " • Extracting text..." : ""}
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

          <Link
            href={`/reader?pdf=${encodeURIComponent(
              pdfName || "Uploaded PDF"
            )}&page=${page}`}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl"
          >
            Ask AI About This Page
          </Link>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 p-5 border-r min-h-screen bg-white/80 text-slate-900">
          <h2 className="font-bold mb-4">Pages</h2>

          {numPages > 0 ? (
            Array.from({ length: numPages }, (_, index) => index + 1)
              .slice(0, 20)
              .map((item) => (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={`w-full border rounded-xl h-20 mb-3 flex items-center justify-center shadow-sm ${
                    page === item
                      ? "bg-blue-100 border-blue-500"
                      : "bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  Page {item}
                </button>
              ))
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
                  <h2 className="text-4xl font-bold">Upload a PDF Book</h2>

                  <p className="mt-4 text-slate-500 max-w-xl">
                    This reader supports real PDF books with page navigation,
                    zoom, fullscreen, voice reading, accessibility controls, and
                    AI page analysis.
                  </p>

                  <label className="mt-8 bg-blue-600 text-white px-8 py-4 rounded-2xl cursor-pointer">
                    Choose PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      className="hidden"
                    />
                  </label>
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