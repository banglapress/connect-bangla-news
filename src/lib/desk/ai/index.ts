import { heuristicProvider } from "./heuristic";
import { openaiProvider } from "./openai";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  if (openaiProvider.isConfigured()) return openaiProvider;
  return heuristicProvider;
}

export { heuristicProvider, openaiProvider };
export type { AIProvider, ExtractedClaim, ResearchPacket, SourcePacket } from "./types";
