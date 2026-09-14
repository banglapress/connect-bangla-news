import { geminiProvider } from "./gemini";
import { heuristicProvider } from "./heuristic";
import { openaiProvider } from "./openai";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  if (geminiProvider.isConfigured()) return geminiProvider;
  if (openaiProvider.isConfigured()) return openaiProvider;
  return heuristicProvider;
}

export function getArticleProvider(): AIProvider {
  if (geminiProvider.isConfigured()) return geminiProvider;
  throw new Error("GEMINI_API_KEY is not configured. Article generation requires Gemini.");
}

export { geminiProvider, heuristicProvider, openaiProvider };
export { toLegacyPacket, validateGeneratedArticle } from "./validate";
export type {
  AIProvider,
  ArticleInput,
  ArticleStatus,
  EditorialValidation,
  ExtractedClaim,
  GeneratedArticle,
  ResearchInput,
  ResearchPacket,
  ResearchWarning,
  SourcePacket,
  StructuredResearch,
} from "./types";
