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
    const { question, book, chapter, content, imageDataUrl } = await req.json();

    const studyMode = getStudyMode(question || "");
    const userQuestion = cleanQuestion(question || "");
    const safeContent = content || "No content provided.";
    const trimmedContent = safeContent.slice(0, 12000);

    // Extract language from question — supports all 6 NDL languages
    const langMatch = userQuestion.match(/Respond\s+(?:ONLY\s+)?in[:\s]+([A-Za-z]+)/i);
    const responseLang = langMatch?.[1]?.trim() ?? null;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        answer: "OPENAI_API_KEY is missing. Please add it in .env.local.",
      });
    }

    const userTextContent = `
Book or PDF:
${book || "Unknown"}

Current context:
${chapter || "General"}

Available content:
${trimmedContent}

User question:
${userQuestion}
            `;

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
- Only say "not available in the provided content" if the content is literally empty or says "text extraction unavailable".
${imageDataUrl ? "- An image of a selected region is attached. Base your answer primarily on what is visible in the image." : ""}
- Do not hallucinate book-specific facts not present in the content.
- Keep answers structured, practical, and learner-friendly.
- Adapt strongly to the active study mode.
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

Formatting:
- Use clear headings.
- Use bullets where useful.
- Keep paragraphs short.
- End with a helpful next step.
            `,
          },
          {
            role: "user",
            content: userMessageContent,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        answer:
          data?.error?.message ||
          "OpenAI returned an error. Please check API key, billing, or model access.",
      });
    }

    return NextResponse.json({
      answer:
        data?.choices?.[0]?.message?.content ||
        "AI response was empty.",
    });
  } catch {
    return NextResponse.json({
      answer:
        "Something went wrong while connecting to AI. Please check the API route and request payload.",
    });
  }
}