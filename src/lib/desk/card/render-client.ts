import { cardSize, type CardCopy, type CardRatio, type CardTemplate } from "./template";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let last = lines[maxLines - 1] || "";
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trim();
    lines[maxLines - 1] = last ? `${last}…` : "…";
  }
  return lines;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load card image"));
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

export async function renderConnectCard(input: {
  photoSrc: string;
  logoSrc?: string | null;
  template: CardTemplate;
  copy: CardCopy;
  ratio: CardRatio;
}): Promise<string> {
  const { width, height } = cardSize(input.ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  const header = Math.round(height * 0.078);
  const footer = Math.round(height * 0.268);
  const imageTop = header;
  const imageHeight = height - header - footer;

  ctx.fillStyle = input.template.accent;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = input.template.background;
  ctx.fillRect(0, imageTop + imageHeight, width, footer);

  try {
    const photo = await loadImage(input.photoSrc);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, imageTop, width, imageHeight);
    ctx.clip();
    drawCover(ctx, photo, 0, imageTop, width, imageHeight);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#2A211C";
    ctx.fillRect(0, imageTop, width, imageHeight);
  }

  const fade = ctx.createLinearGradient(0, imageTop + imageHeight - 90, 0, imageTop + imageHeight);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, imageTop + imageHeight - 90, width, 90);

  if (input.logoSrc) {
    try {
      const logo = await loadImage(input.logoSrc);
      const logoH = Math.round(header * 0.62);
      const logoW = Math.round((logo.width / logo.height) * logoH);
      ctx.drawImage(logo, 48, Math.round((header - logoH) / 2), Math.min(logoW, 280), logoH);
    } catch {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = '700 36px "Tiro Bangla", Georgia, serif';
      ctx.fillText(input.template.brand, 48, Math.round(header * 0.64));
    }
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = '700 36px "Tiro Bangla", Georgia, serif';
    ctx.fillText(input.template.brand, 48, Math.round(header * 0.64));
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = '600 22px "Hind Siliguri", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(input.template.brand, width - 48, Math.round(header * 0.62));
  ctx.textAlign = "left";

  const pad = 56;
  const textY = imageTop + imageHeight + 46;
  ctx.fillStyle = input.template.accent;
  ctx.font = '700 26px "Hind Siliguri", sans-serif';
  const meta = [input.copy.category, input.copy.dateLabel].filter(Boolean).join("  ·  ");
  ctx.fillText(meta, pad, textY);

  ctx.fillStyle = input.template.text;
  ctx.font = '700 54px "Tiro Bangla", Georgia, serif';
  const headlineLines = wrapLines(ctx, input.copy.headline, width - pad * 2, input.ratio === "1:1" ? 3 : 4);
  headlineLines.forEach((line, index) => {
    ctx.fillText(line, pad, textY + 62 + index * 64);
  });

  ctx.fillStyle = "#4A4038";
  ctx.font = '500 30px "Hind Siliguri", sans-serif';
  const supportTop = textY + 62 + headlineLines.length * 64 + 18;
  const supportLines = wrapLines(ctx, input.copy.support, width - pad * 2, 2);
  supportLines.forEach((line, index) => {
    ctx.fillText(line, pad, supportTop + index * 40);
  });

  ctx.fillStyle = input.template.accent;
  ctx.fillRect(0, height - 18, width, 18);

  return canvas.toDataURL("image/jpeg", 0.88);
}
