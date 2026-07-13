import { NextResponse } from "next/server";

function getStudyMode(question: string) {
  const match = question.match(/\[Study Mode:\s*(.*?)\]/i);
  return match?.[1]?.trim() || "Student";
}

function cleanQuestion(question: string) {
  return question.replace(/\[Study Mode:\s*(.*?)\]\s*/i, "").trim();
}

function getModeInstruction(mode: string) {
  const instructions: Record<string, string> = {
    Student:
      "Explain like a helpful tutor. Use simple language, examples, short sections, and end with quick revision points.",
    Teacher:
      "Respond like a teacher preparing classroom material. Include lesson flow, teaching notes, classroom questions, activities, and homework ideas.",
    Researcher:
      "Respond like an academic research assistant. Include deeper analysis, key concepts, research angles, limitations, and possible further reading topics.",
    "Exam Prep":
      "Respond like an exam coach. Focus on likely questions, scoring points, MCQs, short notes, memory tricks, and revision strategy.",
    "Elder Friendly":
      "Respond in very simple, patient language. Use larger conceptual steps, daily-life examples, avoid jargon, and explain slowly and clearly.",
  };

  return instructions[mode] || instructions.Student;
}

export async function POST(req: Request) {
  try {
    const { question, book, chapter, content, imageDataUrl, scope, history } = await req.json();

    const studyMode = getStudyMode(question || "");
    const userQuestion = cleanQuestion(question || "");
    const safeContent = content || "No content provided.";
    const trimmedContent = safeContent.slice(0, 12000);
    const requestScope = typeof scope === "string" && scope.trim() ? scope.trim() : "current page";

    // Extract language from question — supports all 6 NDL languages
    const langMatch = userQuestion.match(/Respond\s+(?:ONLY\s+)?in[:\s]+([A-Za-z]+)/i);
    const responseLang = langMatch?.[1]?.trim() ?? null;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { answer: "OPENAI_API_KEY is missing. Please add it in .env.local." },
        { status: 500 }
      );
    }

    const userTextContent = `
Book or PDF:
${book || "Unknown"}

Current context:
${chapter || "General"}

Scope of this request:
${requestScope}

Available content:
${trimmedContent}

User question:
${userQuestion}
            `;

    // Prior turns from THIS reading session, oldest first — lets the
    // model resolve follow-ups like "explain that more simply" or
    // "give an example" without the client re-sending the full page/
    // chapter/book content again for every turn. Capped defensively
    // here too (not just client-side) since this is a public route.
    const priorTurns: { question?: string; answer?: string }[] = Array.isArray(history) ? history.slice(-3) : [];
    const historyMessages = priorTurns
      .filter((t) => t?.question && t?.answer)
      .flatMap((t) => [
        { role: "user" as const, content: String(t.question) },
        { role: "assistant" as const, content: String(t.answer) },
      ]);

    // NEW, purely additive: when imageDataUrl is provided (an image/
    // diagram region the user selected from the page), the user
    // message becomes a multimodal content array — the same text
    // block as before, PLUS an image_url part — instead of a plain
    // string. When imageDataUrl is absent, this is byte-for-byte the
    // same request shape as before; no existing text-only behavior
    // changes.
    const userMessageContent = imageDataUrl
      ? [
          { type: "text", text: userTextContent },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ]
      : userTextContent;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: `
You are NDL AI Tutor, an AI tutor inside a national digital learning platform.

Core rules:
- The provided page content is the PRIMARY source. USE IT. Do not say content is unavailable unless the content block is truly empty.
- If the content block has text, base your response on that text.
- NEVER respond with only a bare refusal such as "not available in the provided content" — that is not an acceptable complete answer under any circumstances. If the content is genuinely thin or partial, say so in ONE brief sentence at most, then still produce a useful, honest response from whatever IS there (book title, description, any text present) — the response must always contain real substance beyond the caveat itself.
${imageDataUrl ? "- An image of a selected region is attached. Base your answer primarily on what is visible in the image." : ""}
- Do not hallucinate book-specific facts not present in the content.
- Keep answers structured, practical, and learner-friendly.
- Adapt strongly to the active study mode.

Scope of this request: ${requestScope}.
- The "Available content" block already reflects this exact scope — trust it completely, it is not just "one page" unless the scope says so.
- NEVER say things like "I only have access to one page" or "please provide more content" when the scope is "current chapter", "entire book", or "selected text" — the content block already contains everything you have for that scope; use it fully and confidently.
- Only mention a scope limitation if the content block is genuinely empty or explicitly says extraction was unavailable — and even then, still attempt a useful answer from the book title/context rather than refusing.
${historyMessages.length > 0 ? `- This is a FOLLOW-UP question — earlier turns from the same reading session are included above as conversation history. Stay consistent with your previous answers, resolve references like "that" or "this" using them, and build on them naturally rather than repeating yourself.` : ""}
${responseLang ? `
LANGUAGE INSTRUCTION — MANDATORY:
The user has selected "${responseLang}" as their response language.
You MUST write your ENTIRE response in ${responseLang}.
Supported languages and their usage:
- English: standard English
- Hindi: Devanagari script (हिंदी)
- Tamil: Tamil script (தமிழ்)
- Bengali: Bengali script (বাংলা)
- Marathi: Devanagari script (मराठी)
- Telugu: Telugu script (తెలుగు)

RULES (never violate):
1. Write every sentence in ${responseLang} — no English fallback.
2. NEVER say "I cannot translate" or "translation unavailable".
3. NEVER refuse to respond in ${responseLang}.
4. If you don't have a word, use the closest ${responseLang} equivalent or keep the technical term.
5. This is an Indian language learning platform — all languages above are fully supported.
` : ""}

Active study mode:
${studyMode}

Mode behavior:
${getModeInstruction(studyMode)}

Response quality:
- Use clear headings and short paragraphs.
- Use bullet points for lists, steps, or key facts.
- Include at least one concrete example when explaining a concept, where it genuinely helps.
- End substantive explanations with a short "Key Takeaways" section (2-4 bullets) — skip this for translations, quizzes, or flashcards, where it would be redundant.
- Do not repeat disclaimers ("I am an AI", "as a language model", "I don't have access to the internet", etc.) — get straight to the answer.
- Never invent book-specific facts, numbers, names, or events not supported by the provided content. If something isn't in the content and isn't common knowledge, say so briefly rather than guessing.
- End with a helpful next step only when it adds value — do not force one onto every response.
            `,
          },
          ...historyMessages,
          {
            role: "user",
            content: userMessageContent,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { answer: "The AI tutor is temporarily unavailable. Please try again in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      answer:
        data?.choices?.[0]?.message?.content ||
        "AI response was empty.",
    });
  } catch {
    return NextResponse.json(
      { answer: "The AI tutor couldn't be reached right now. Please try again in a moment." },
      { status: 500 }
    );
  }
}