export const SITE_LOGO_SRC = "/logo.png";

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load cover image or logo"));
    image.src = src;
  });
  return image;
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}

export async function composeCoverWithLogo(input: {
  photoSrc: string;
  logoSrc?: string | null;
  width?: number;
  height?: number;
}): Promise<string> {
  const width = input.width || 1600;
  const height = input.height || 900;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const photo = await loadImage(input.photoSrc);
  drawCover(ctx, photo, 0, 0, width, height);
  try {
    const logo = await loadImage(input.logoSrc || SITE_LOGO_SRC);
    const maxLogoW = Math.round(width * 0.14);
    const scale = maxLogoW / logo.width;
    const logoW = Math.round(logo.width * scale);
    const logoH = Math.round(logo.height * scale);
    const margin = Math.round(width * 0.028);
    ctx.drawImage(logo, margin, height - logoH - margin, logoW, logoH);
  } catch {
    throw new Error("The site logo could not be loaded from /logo.png");
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function composeSocialCover(photoSrc: string, logoSrc?: string | null) {
  return composeCoverWithLogo({ photoSrc, logoSrc: logoSrc ?? SITE_LOGO_SRC, width: 1080, height: 1350 });
}
