import { publicImageUrl } from "@/lib/image";

export function renderArticleBody(body: string, images: string[]) {
  const blocks = body.split(/\n{2,}/).filter(Boolean);
  return blocks.map((block, index) => {
    const match = block.trim().match(/^\{\{image:(\d+)\}\}$/i);
    if (match) {
      const image = publicImageUrl(images[Number(match[1]) - 1] ?? null);
      if (!image) return null;
      return (
        <figure key={`img-${index}`} className="my-6">
          <img src={image} alt="" className="w-full object-cover" />
        </figure>
      );
    }
    return <p key={index}>{block}</p>;
  });
}
