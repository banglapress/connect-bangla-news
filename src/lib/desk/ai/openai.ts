import type { AIProvider, ArticleInput, ExtractedClaim, GeneratedArticle, ResearchInput, SourcePacket, StructuredResearch } from "./types";

export const openaiProvider: AIProvider = {
  name: "openai",
  model: null,
  isConfigured() {
    return Boolean(typeof process !== "undefined" && process.env.OPENAI_API_KEY);
  },
  async extractClaims(_source: SourcePacket): Promise<ExtractedClaim[]> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
  async summarizeTopic(): Promise<string> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
  async generateResearch(_input: ResearchInput): Promise<StructuredResearch> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
  async generateArticle(_input: ArticleInput): Promise<GeneratedArticle> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
};
