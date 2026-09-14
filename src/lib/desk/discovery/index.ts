import { gdeltProvider } from "./gdelt";
import type { DiscoveryProvider } from "./types";

export function getDiscoveryProvider(): DiscoveryProvider {
  return gdeltProvider;
}

export type { DiscoveryHit, DiscoveryProvider } from "./types";
