import { geminiProvider } from "./gemini";
import { heuristicProvider } from "./heuristic";
import { openaiProvider } from "./openai";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  if (geminiProvider.isConfigured()) return geminiProvider;
  return heuristicProvider;
}

export function getArticleProvider(): AIProvider {
  if (geminiProvider.isConfigured()) return geminiProvider;
  throw new Error("GEMINI_API_KEY is not configured. Article generation requires Gemini.");
}

export { geminiProvider, heuristicProvider, openaiProvider };
export { DEFAULT_GEMINI_MODEL } from "./gemini";
export { toLegacyPacket, validateGeneratedArticle } from "./validate";
export { DEPTH_TARGETS, inferArticleDepth, parseArticleDepth, countWords } from "./quality";
export {
  classifyContentLevel,
  availableSourceText,
  extractSourceNote,
  markUniqueNotes,
  utilizationFromNotes,
  packSourceNotes,
  sourceFingerprint,
} from "./source-content";
export type {
  AIProvider,
  ArticleDepth,
  ArticleInput,
  ArticleStatus,
  EditorialValidation,
  ExtractedClaim,
  GeneratedArticle,
  QualityMetrics,
  ResearchInput,
  ResearchPacket,
  ResearchWarning,
  SourcePacket,
  StructuredResearch,
} from "./types";
