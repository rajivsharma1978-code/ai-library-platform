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
- Use the provided book/PDF content as the primary source.
${imageDataUrl ? "- An image of a selected diagram/figure/table region from the page is attached. Base your answer primarily on what is visible in that image, using the surrounding page text only as supporting context." : ""}
- If the exact answer is not present, say: "This is not clearly available in the provided content", then give a helpful general explanation.
- Do not hallucinate book-specific facts.
- Keep answers structured, practical, and learner-friendly.
- Adapt strongly to the active study mode.

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