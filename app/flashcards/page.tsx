"use client";

import { useEffect, useState } from "react";

type Card = {
  question: string;
  answer: string;
};

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [openCards, setOpenCards] = useState<number[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("ndl_ai_notes");
    if (!saved) return;

    const notes = JSON.parse(saved);

    const generated = notes.slice(0, 20).map((note: any) => ({
      question: `What is the key idea from ${note.chapter}?`,
      answer: note.text,
    }));

    setCards(generated);
  }, []);

  const toggleCard = (index: number) => {
    setOpenCards((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index]
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
  <div>
    <h1 className="text-4xl font-bold">
      AI Flashcards
    </h1>

    <p className="mt-2 text-slate-600">
      Click a card to reveal the answer.
    </p>
  </div>

  <a
    href="/"
    className="rounded-xl bg-black px-4 py-2 text-white"
  >
    ← Home
  </a>
</div>

        <p className="mb-8 text-slate-600">
          Click a card to reveal the answer.
        </p>

        {cards.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 shadow">
            No flashcards yet. Save notes from the Reader first.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((card, index) => (
              <button
                key={index}
                onClick={() => toggleCard(index)}
                className="min-h-48 rounded-3xl bg-white p-6 text-left shadow hover:shadow-md"
              >
                <p className="mb-3 text-xs font-semibold text-slate-400">
                  Flashcard {index + 1}
                </p>

                <h3 className="mb-4 text-lg font-bold text-slate-900">
                  {card.question}
                </h3>

                {openCards.includes(index) ? (
                  <p className="text-slate-700">{card.answer}</p>
                ) : (
                  <p className="text-sm text-slate-400">
                    Tap to reveal answer
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}