import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { question, book, chapter, content } = await req.json();

    const safeContent = content || "No content provided.";
    const trimmedContent = safeContent.slice(0, 12000);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        answer: `Demo AI answer based on available content.

Book/PDF: ${book}
Context: ${chapter}

Question: ${question}

This response is running in demo mode because OPENAI_API_KEY is not configured. Once the API key is added, I will answer directly from the uploaded PDF or selected book content.`,
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `
You are an AI tutor for NDL AI, an AI-powered public digital library.

Your job:
- Answer only from the provided book/PDF content when possible.
- Explain clearly for students, elderly users, and multilingual learners.
- If the answer is not found in the content, say that clearly.
- Keep answers structured with bullet points when helpful.
- Support summaries, quizzes, simple explanations, translations, and study notes.
            `,
          },
          {
            role: "user",
            content: `
Book or PDF:
${book}

Current context:
${chapter}

Available content:
${trimmedContent}

User question:
${question}
            `,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        answer:
          data?.error?.message ||
          "OpenAI returned an error. Please check your API key, billing, or model access.",
      });
    }

    return NextResponse.json({
      answer:
        data?.choices?.[0]?.message?.content ||
        "AI response was empty.",
    });
  } catch (error) {
    return NextResponse.json({
      answer:
        "Something went wrong while connecting to AI. Please check the API route and request payload.",
    });
  }
}