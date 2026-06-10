"use client";

import AICompanion from "@/components/reader-premium/AICompanion";
import FloatingToolbar from "@/components/reader-premium/FloatingToolbar";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";
import OpenBook from "@/components/reader-premium/OpenBook";
import BookCover from "@/components/reader-premium/BookCover";
import { useState } from "react";
import ReaderLayout from "@/components/reader/ReaderLayout";
import FlipBookStage from "@/components/reader/FlipBookStage";

export default function PremiumReaderPreview() {
  const [readerPage, setReaderPage] = useState(1);
  const [bookOpened, setBookOpened] = useState(false);
  const [bookOpening, setBookOpening] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [aiResponse, setAiResponse] = useState(
    "Select text from the book or ask anything about this reading spread."
  );
  const [aiQuestion, setAiQuestion] = useState("");
  
  const book = "NDL AI Premium Flipbook Demo";
  const pdfPages = "120";

  const activeContent =
    "This premium reader is designed for the National Digital Library AI platform. It supports open-book reading, double-page spread, AI explanation, summaries, multilingual learning, quizzes, notes, and future visual understanding of diagrams, maps, charts, and illustrations.";
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
        title="Artificial Intelligence"
        subtitle="National Digital Library AI"
        author="Director Demo Collection"
        onOpen={openBookWithAnimation}
      />
    ) : (
    <ReaderLayout
      leftPanel={
        <div>
          <h2 className="text-2xl font-black">Book Info</h2>
          <p className="mt-3 text-sm text-slate-400">
            Chapters, thumbnails, bookmarks, and reading history will appear here.
          </p>
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
      
          <OpenBook
          title={book}
          pageNumber={readerPage}
          totalPages={pdfPages}
          leftText={activeContent}
          rightText="The AI-powered National Digital Library experience continues on the next page. Learners can ask questions, translate content, create notes, generate quizzes, and build flashcards directly from the book."
          onPrevious={() => setReaderPage((page) => Math.max(1, page - 2))}
          onNext={() => setReaderPage((page) => Math.min(120, page + 2))}
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