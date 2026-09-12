import { publicImageUrl } from "@/lib/image";
import { youtubeEmbedUrl } from "@/lib/youtube";

type Props = {
  contentType?: string | null;
  youtubeUrl?: string | null;
  imageUrl?: string | null;
  title: string;
  className?: string;
};

export function ArticleMedia({ contentType, youtubeUrl, imageUrl, title, className = "" }: Props) {
  if (contentType === "video") {
    const embed = youtubeEmbedUrl(youtubeUrl);
    if (embed) {
      return (
        <div className={`aspect-video w-full overflow-hidden bg-black ${className}`}>
          <iframe
            src={embed}
            title={title}
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
  return <img src={image} alt={title} className={`w-full object-cover ${className}`} />;
}
