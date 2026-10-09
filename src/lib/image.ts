export function publicImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace("/object/sign/", "/object/public/");
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}


export type ResponsiveImageSources = {
  src: string;
  srcSet?: string;
};

/**
 * Produce responsive, auto-format Cloudinary URLs when an article image is
 * hosted there. Other hosts (including Supabase Storage) keep their public URL.
 */
function cloudinaryWidthUrl(rawUrl: string, width: number): string {
  const url = new URL(rawUrl);
  const marker = "/image/upload/";
  const uploadIndex = url.pathname.indexOf(marker);
  if (uploadIndex < 0) return rawUrl;

  const before = url.pathname.slice(0, uploadIndex + marker.length);
  const rest = url.pathname.slice(uploadIndex + marker.length);
  const segments = rest.split("/");
  const transformSegment = (segment: string) =>
    segment.includes(",") ||
    /^(c_|f_|q_|w_|h_|ar_|g_|dpr_|e_|fl_|d_|bo_|r_|b_|t_)/.test(segment);

  // Insert our width/format transform after any existing transforms, before
  // the version/public ID. This avoids overwriting the asset's public ID.
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  let insertAt = versionIndex >= 0 ? versionIndex : 0;
  if (versionIndex < 0) {
    while (insertAt < segments.length && transformSegment(segments[insertAt] || "")) insertAt += 1;
  }
  segments.splice(insertAt, 0, `f_auto,q_auto,w_${width}`);
  url.pathname = before + segments.join("/");
  return url.toString();
}

export function responsiveImageSources(rawUrl: string | null | undefined): ResponsiveImageSources | null {
  const src = publicImageUrl(rawUrl);
  if (!src) return null;

  try {
    const url = new URL(src);
    if (url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/image/upload/")) {
      return { src };
    }

    const widths = [480, 768, 1200];
    return {
      src: cloudinaryWidthUrl(src, 1200),
      srcSet: widths.map((width) => `${cloudinaryWidthUrl(src, width)} ${width}w`).join(", "),
    };
  } catch {
    return { src };
  }
}
