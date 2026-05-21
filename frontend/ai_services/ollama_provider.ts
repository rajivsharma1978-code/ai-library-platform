import type {
  AIProvider,
  AnswerQuestionInput,
  AnswerResult,
  EmbeddingsInput,
  EmbeddingsResult,
  GenerateSummaryInput,
  SummaryResult,
} from "./base";

export class OllamaProvider implements AIProvider {
  kind = "ollama" as const;
  model = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

  async generateSummary(input: GenerateSummaryInput): Promise<SummaryResult> {
    const text = input.text.replace(/\s+/g, " ").trim();
    const snippets = text.split(".").slice(0, 2).join(". ").trim();
    return {
      summary: `[Ollama local mock] ${snippets}${snippets.endsWith(".") ? "" : "."}`,
      provider: this.kind,
      model: this.model,
    };
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<AnswerResult> {
    return {
      answer: `[Ollama local mock] Q: ${input.question}\nA: Response generated from local model context.`,
      citations: ["Local Vector Store Chunk #12", "Local Vector Store Chunk #19"],
      provider: this.kind,
      model: this.model,
    };
  }

  async createEmbeddings(input: EmbeddingsInput): Promise<EmbeddingsResult> {
    const dimension = 8;
    const vectors = input.texts.map((text) => {
      const hash = Array.from(text).reduce((acc, c) => acc ^ c.charCodeAt(0), 17);
      return Array.from({ length: dimension }, (_, i) => ((hash + i * 5) % 89) / 89);
    });

    return {
      vectors,
      dimension,
      provider: this.kind,
      model: `${this.model}-embed`,
    };
  }
}
