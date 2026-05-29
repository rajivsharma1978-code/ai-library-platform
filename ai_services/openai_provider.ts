import type {
  AIProvider,
  AnswerQuestionInput,
  AnswerResult,
  EmbeddingsInput,
  EmbeddingsResult,
  GenerateSummaryInput,
  SummaryResult,
} from "./base";

export class OpenAIProvider implements AIProvider {
  kind = "openai" as const;
  model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  async generateSummary(input: GenerateSummaryInput): Promise<SummaryResult> {
    const maxWords = input.maxWords ?? 110;
    const normalized = input.text.replace(/\s+/g, " ").trim();
    const clipped = normalized.split(" ").slice(0, maxWords).join(" ");

    return {
      summary: `[OpenAI mock] ${clipped}${clipped.endsWith(".") ? "" : "."}`,
      provider: this.kind,
      model: this.model,
    };
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<AnswerResult> {
    const language = input.language ?? "en";
    const contextLine = input.context ? `Context considered: ${input.context.slice(0, 160)}.` : "";
    const answer =
      language === "hi"
        ? `[OpenAI mock] प्रश्न: "${input.question}" का उत्तर संदर्भ आधारित रूप में तैयार किया गया है। ${contextLine}`
        : `[OpenAI mock] Answer generated for "${input.question}" with grounded context. ${contextLine}`;

    return {
      answer,
      citations: ["Mock Source A", "Mock Source B"],
      provider: this.kind,
      model: this.model,
    };
  }

  async createEmbeddings(input: EmbeddingsInput): Promise<EmbeddingsResult> {
    const dimension = 8;
    const vectors = input.texts.map((text, idx) => {
      const seed = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0) + idx;
      return Array.from({ length: dimension }, (_, i) => ((seed + i * 13) % 97) / 97);
    });

    return {
      vectors,
      dimension,
      provider: this.kind,
      model: "text-embedding-3-small",
    };
  }
}
