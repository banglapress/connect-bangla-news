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
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function decodeEscapedLexicalHtml(value: string) {
  // Older/buggy editor saves can contain HTML that was escaped once before
  // being stored (e.g. &lt;p dir=&quot;ltr&quot;&gt;...&lt;/p&gt;). Decode only
  // when the value clearly looks like escaped Lexical markup so normal text
  // such as "a &lt; b" is left untouched.
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

export function renderArticleBody(value: string | null | undefined) {
  const body = decodeEscapedLexicalHtml(String(value || "").trim());
  if (!body) return "";
  if (!body) return "";
  if (!/<[a-z][^>]*>/i.test(body)) return plainTextToHtml(body);

  return sanitizeHtml(body, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "del",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "figure",
      "figcaption",
      "img",
      "div",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
      p: ["style"],
      div: ["style"],
      figure: ["class"],
      figcaption: ["class"],
    },
    allowedStyles: {
      p: {
        "text-align": [/^(left|center|right|justify)$/],
      },
      div: {
        "text-align": [/^(left|center|right|justify)$/],
      },
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
