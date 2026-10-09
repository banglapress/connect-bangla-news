import { publicImageUrl } from "@/lib/image";
import { youtubeEmbedUrl } from "@/lib/youtube";

type Props = {
  contentType?: string | null;
  youtubeUrl?: string | null;
  imageUrl?: string | null;
  title: string;
  className?: string;
  priority?: boolean;
};

export function ArticleMedia({ contentType, youtubeUrl, imageUrl, title, className = "", priority = false }: Props) {
  if (contentType === "video") {
    const embed = youtubeEmbedUrl(youtubeUrl);
    if (embed) {
      return (
        <div className={`aspect-video w-full overflow-hidden bg-black ${className}`}>
          <iframe
            src={embed}
            title={title}
            loading={priority ? "eager" : "lazy"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }
  const image = publicImageUrl(imageUrl);
  if (!image) return null;
  return (
    <img
      src={image}
      alt={title}
      width={1200}
      height={675}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={`w-full object-cover ${className}`}
    />
  );
}
