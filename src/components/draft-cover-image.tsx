import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeskCoverImagePanel } from "@/components/desk-cover-image-panel";
import { resolveDeskStoryForArticle } from "@/lib/desk/cover-image.functions";

export function DraftCoverImage({ articleId, onApplied }: { articleId?: string | null; onApplied?: (url: string) => void }) {
  const resolve = useServerFn(resolveDeskStoryForArticle);
  const query = useQuery({
    queryKey: ["desk-story-for-article", articleId],
    enabled: Boolean(articleId),
    queryFn: () => resolve({ data: { articleId: articleId as string } }),
  });
  if (!articleId || !query.data?.storyId) return null;
  return <DeskCoverImagePanel storyId={query.data.storyId} articleReady onApplied={onApplied} />;
}
