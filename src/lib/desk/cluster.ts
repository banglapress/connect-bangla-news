import { clusterKeyFromTitle } from "./url";

export type ClusterHint = {
  method: "title" | "semantic";
  key: string;
  score: number;
};

export function titleClusterHint(title: string): ClusterHint {
  return { method: "title", key: clusterKeyFromTitle(title), score: 1 };
}

export async function semanticClusterHint(_title: string, _excerpt: string): Promise<ClusterHint | null> {
  return null;
}
