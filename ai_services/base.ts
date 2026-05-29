import { ClaudeProvider } from "./claude_provider";
import { OllamaProvider } from "./ollama_provider";
import { OpenAIProvider } from "./openai_provider";

export type ProviderKind = "claude" | "openai" | "ollama" | "bedrock";

export type GenerateSummaryInput = {
  text: string;
  maxWords?: number;
  tone?: "academic" | "concise" | "plain";
};

export type AnswerQuestionInput = {
  question: string;
  context?: string;
  language?: "en" | "hi";
};

export type EmbeddingsInput = {
  texts: string[];
};

export type SummaryResult = {
  summary: string;
  provider: ProviderKind;
  model: string;
};

export type AnswerResult = {
  answer: string;
  citations: string[];
  provider: ProviderKind;
  model: string;
};

export type EmbeddingsResult = {
  vectors: number[][];
  dimension: number;
  provider: ProviderKind;
  model: string;
};

export interface AIProvider {
  kind: ProviderKind;
  model: string;
  generateSummary(input: GenerateSummaryInput): Promise<SummaryResult>;
  answerQuestion(input: AnswerQuestionInput): Promise<AnswerResult>;
  createEmbeddings(input: EmbeddingsInput): Promise<EmbeddingsResult>;
}

export type AIServiceConfig = {
  provider: ProviderKind;
};

const DEFAULT_PROVIDER = (process.env.AI_PROVIDER as ProviderKind | undefined) ?? "openai";

const providers: Record<Exclude<ProviderKind, "bedrock">, AIProvider> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  ollama: new OllamaProvider(),
};

let runtimeConfig: AIServiceConfig = { provider: DEFAULT_PROVIDER };

export function configureAIService(config: Partial<AIServiceConfig>) {
  runtimeConfig = { ...runtimeConfig, ...config };
}

function getProvider(): AIProvider {
  if (runtimeConfig.provider === "bedrock") {
    throw new Error(
      "Bedrock provider is reserved for future use. Add a bedrock_provider.ts implementation and register it in base.ts."
    );
  }

  return providers[runtimeConfig.provider];
}

export async function generateSummary(input: GenerateSummaryInput): Promise<SummaryResult> {
  return getProvider().generateSummary(input);
}

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerResult> {
  return getProvider().answerQuestion(input);
}

export async function createEmbeddings(input: EmbeddingsInput): Promise<EmbeddingsResult> {
  return getProvider().createEmbeddings(input);
}
