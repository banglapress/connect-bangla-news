export function extractYoutubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/watch\?[^\"]*v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function youtubeEmbedUrl(input: string | null | undefined): string | null {
  const id = extractYoutubeId(input);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
