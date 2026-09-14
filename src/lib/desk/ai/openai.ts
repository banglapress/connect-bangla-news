import type { AIProvider, ExtractedClaim, SourcePacket } from "./types";

export const openaiProvider: AIProvider = {
  name: "openai",
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },
  async extractClaims(_source: SourcePacket): Promise<ExtractedClaim[]> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
  async summarizeTopic(): Promise<string> {
    throw new Error("OpenAI provider is not enabled in this phase");
  },
};
