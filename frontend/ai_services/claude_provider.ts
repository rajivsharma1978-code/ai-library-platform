import type {
  AIProvider,
  AnswerQuestionInput,
  AnswerResult,
  EmbeddingsInput,
  EmbeddingsResult,
  GenerateSummaryInput,
  SummaryResult,
} from "./base";

export class ClaudeProvider implements AIProvider {
  kind = "claude" as const;
  model = process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

  async generateSummary(input: GenerateSummaryInput): Promise<SummaryResult> {
    const words = input.text.replace(/\s+/g, " ").trim().split(" ");
    const cap = input.maxWords ?? 100;
    const condensed = words.slice(0, cap).join(" ");
    const tone = input.tone ?? "academic";

    return {
      summary: `[Claude mock:${tone}] ${condensed}${condensed.endsWith(".") ? "" : "."}`,
      provider: this.kind,
      model: this.model,
    };
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<AnswerResult> {
    const isHindi = input.language === "hi";
    return {
      answer: isHindi
        ? `[Claude mock] प्रश्न "${input.question}" के लिए व्याख्यात्मक उत्तर तैयार है।`
        : `[Claude mock] Structured response prepared for "${input.question}".`,
      citations: ["Mock Policy Handbook p.42", "Mock Legal Digest p.88"],
      provider: this.kind,
      model: this.model,
    };
  }

  async createEmbeddings(input: EmbeddingsInput): Promise<EmbeddingsResult> {
    const dimension = 8;
    const vectors = input.texts.map((text, row) =>
      Array.from({ length: dimension }, (_, col) => {
        const base = text.length * (row + 1) + col * 7;
        return (base % 100) / 100;
      })
    );

    return {
      vectors,
      dimension,
      provider: this.kind,
      model: "claude-embedding-mock",
    };
  }
}
