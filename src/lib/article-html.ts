import sanitizeHtml from "sanitize-html";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => "<p>" + escapeHtml(paragraph).replace(/\n/g, "<br />") + "</p>")
    .join("");
}

function decodeEscapedLexicalHtml(value: string) {
  if (!/&lt;\/?(?:p|span|div|figure|strong|em|u|s|code|blockquote|ul|ol|li|img)\b/i.test(value)) {
    return value;
  }

  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&");
}

export function normalizeArticleBodyForStorage(value: string | null | undefined) {
  let body = decodeEscapedLexicalHtml(String(value || "").trim());
  if (!body) return "";

  body = body
    .replace(/<p\b([^>]*)>\s*<span\b[^>]*data-lexical-text=["']true["'][^>]*>([\s\S]*?)<\/span>\s*<\/p>/gi, "<p$1>$2</p>")
    .replace(/<span\b[^>]*data-lexical-text=["']true["'][^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<p\s*dir=["']ltr["']([^>]*)>/gi, "<p$1>")
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "")
    .replace(/\s*<br\s*\/?>\s*<\/p>/gi, "</p>")
    .trim();

  return body;
}

export function removeImageFromArticleBody(value: string | null | undefined, imageUrl: string) {
  const body = normalizeArticleBodyForStorage(value);
  if (!body || !imageUrl) return body;
  const escapedUrl = imageUrl.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return body
    .replace(new RegExp("<div\\b[^>]*article-image-node[^>]*>[\\s\\S]*?<img\\b[^>]*src=[\\\"']" + escapedUrl + "[\\\"'][^>]*>[\\s\\S]*?</div>", "gi"), "")
    .replace(new RegExp("<figure\\b[^>]*>[\\s\\S]*?<img\\b[^>]*src=[\\\"']" + escapedUrl + "[\\\"'][^>]*>[\\s\\S]*?</figure>", "gi"), "")
    .replace(new RegExp("<img\\b[^>]*src=[\\\"']" + escapedUrl + "[\\\"'][^>]*>", "gi"), "")
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "")
    .trim();
}

export function renderArticleBody(value: string | null | undefined) {
  const body = normalizeArticleBodyForStorage(value);
  if (!body) return "";
  if (!/<[a-z][^>]*>/i.test(body)) return plainTextToHtml(body);

  return sanitizeHtml(body, {
    allowedTags: [
      "p", "br", "strong", "b", "span", "em", "i", "u", "s", "del",
      "code", "pre", "blockquote", "ul", "ol", "li", "a", "figure",
      "figcaption", "img", "div",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["style", "class", "data-lexical-text"],
      img: ["src", "alt", "title"],
      p: ["style"],
      div: ["style"],
      figure: ["class"],
      figcaption: ["class"],
    },
    allowedStyles: {
      p: { "text-align": [/^(left|center|right|justify)$/] },
      div: { "text-align": [/^(left|center|right|justify)$/] },
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
