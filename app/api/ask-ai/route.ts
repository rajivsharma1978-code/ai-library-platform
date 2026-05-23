import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { question, book, chapter, content } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        answer:
          "OpenAI API key is missing. Please add OPENAI_API_KEY in .env.local.",
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
        messages: [
          {
            role: "system",
            content:
              "You are an AI tutor for NDL AI. Explain concepts clearly, simply, and helpfully for students.",
          },
          {
            role: "user",
            content: `
Book: ${book}
Chapter: ${chapter}
Chapter Content: ${content}

Student question:
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
          "OpenAI returned an error. Please check your API key or billing.",
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "AI response was empty.";

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json({
      answer:
        "Something went wrong while connecting to AI. Please check the API route.",
    });
  }
}