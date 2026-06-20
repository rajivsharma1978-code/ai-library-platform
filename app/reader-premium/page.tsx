"use client";

import { Suspense } from "react";
import PdfBookSpread from "@/components/reader-premium/PdfBookSpread";
import AICompanion from "@/components/reader-premium/AICompanion";
import FloatingToolbar from "@/components/reader-premium/FloatingToolbar";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";

import BookCover from "@/components/reader-premium/BookCover";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { directorBooks } from "@/lib/directorBooks";
import ReaderLayout from "@/components/reader/ReaderLayout";
import FlipBookStage from "@/components/reader/FlipBookStage";

export default function PremiumReaderPreview() {
  return (
    <Suspense fallback={<div className="p-6">Loading reader...</div>}>
      <PremiumReaderPreviewContent />
    </Suspense>
  );
}

function PremiumReaderPreviewContent() {
  const [readerPage, setReaderPage] = useState(1);
  const [bookOpened, setBookOpened] = useState(false);
  const [bookOpening, setBookOpening] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [aiResponse, setAiResponse] = useState(
    "Select text from the book or ask anything about this reading spread."
  );
  const [aiQuestion, setAiQuestion] = useState("");
  const searchParams = useSearchParams();

const bookId = searchParams.get("book") || "nalanda";

const currentBook =
  directorBooks.find((b) => b.id === bookId) || directorBooks[0];

const book = currentBook.title;

const pdfPages = String(currentBook.pages);

const activeContent = currentBook.description;
const pdfPath = currentBook.pdf;
  
  function askPremiumAI() {
      if (!aiQuestion.trim()) return;
    
      setAiResponse(
        `AI Learning Companion:\n\nYou asked: "${aiQuestion}"\n\nBased on the current reading spread, AI can explain the concept, summarize the passage, translate it into Indian languages, create quizzes, and prepare revision notes.`
      );
    
      setAiQuestion("");
    }
    
    function openBookWithAnimation() {
      setBookOpening(true);
    
      setTimeout(() => {
        setBookOpened(true);
        setBookOpening(false);
      }, 900);
    }
  return (
    <>
    {bookOpening ? (
  <BookOpeningAnimation title={book} />
) : !bookOpened ? (
  <BookCover
  title={currentBook.title}
  subtitle="National Digital Library AI"
  author={currentBook.author}
  description={currentBook.description}
  onOpen={openBookWithAnimation}
/>
    ) : (
    <ReaderLayout
    leftPanel={
      <div>
        <h2 className="text-2xl font-black">{currentBook.title}</h2>
    
        <p className="mt-3 text-sm text-slate-400">
          {currentBook.author}
        </p>
    
        <p className="mt-5 text-sm leading-7 text-slate-300">
          {currentBook.description}
        </p>
    
        <div className="mt-6 rounded-2xl bg-white/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Book Details
          </p>
    
          <p className="mt-3 text-sm">Pages: {currentBook.pages}</p>
          <p className="mt-2 text-sm">Language: {currentBook.language}</p>
        </div>
    
        <a
          href={pdfPath}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-white"
        >
          Open Original PDF
        </a>
      </div>
    }
      center={
        <div
          onMouseUp={() => {
            const text = window.getSelection()?.toString().trim() || "";
            setSelectedText(text);
          }}
        >
          <FloatingToolbar
  selectedText={selectedText}
  onExplain={() =>
    setAiResponse(
      `Explanation:\n\n${selectedText}\n\nThis selected text can be explained in simple language by the AI Learning Companion.`
    )
  }
  onSummarize={() =>
    setAiResponse(
      `Summary:\n\nThe selected text mainly discusses: ${selectedText}`
    )
  }
  onTranslate={() =>
    setAiResponse(
      `Hindi Translation Demo:\n\nयह चयनित पाठ AI द्वारा हिंदी में समझाया और अनुवादित किया जा सकता है।`
    )
  }
  onQuiz={() =>
    setAiResponse(
      `Quiz:\n\n1. What is the main idea of the selected text?\n2. Why is this concept important?\n3. How can this be applied in learning?`
    )
  }
  onSaveNote={() =>
    setAiResponse(`Saved as note:\n\n${selectedText}`)
  }
  onClose={() => {
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }}
/>
      
<PdfBookSpread
  title={book}
  pdfPath={currentBook.pdf}
  pageNumber={readerPage}
  totalPages={pdfPages}
  onPrevious={() => setReaderPage((page) => Math.max(1, page - 1))}
  onNext={() =>
    setReaderPage((page) =>
      Math.min(Number(pdfPages), page + 1)
    )
  }
/>
          </div>
        }

        rightPanel={
          <AICompanion
            aiResponse={aiResponse}
            aiQuestion={aiQuestion}
            setAiQuestion={setAiQuestion}
            onAsk={askPremiumAI}
            onQuickAction={(action) =>
              setAiResponse(
                `${action}\n\nAI Learning Companion will perform this action on the current reading spread.`
              )
            }
          />
        }
           />
             )}
           </>
         );
       }