const attributedItem = {
  type: "object",
  properties: {
    text: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
    source_urls: { type: "array", items: { type: "string" } },
    support: { type: "string", enum: ["multi_source", "single_source", "conflicting", "unverified"] },
  },
  required: ["text", "source_ids", "source_urls", "support"],
  additionalProperties: false,
};

const warningItem = {
  type: "object",
  properties: {
    code: {
      type: "string",
      enum: ["conflict", "single_source", "needs_verification", "insufficient_sources", "heuristic", "missing_attribution", "unsupported"],
    },
    message: { type: "string" },
  },
  required: ["code", "message"],
  additionalProperties: false,
};

export const RESEARCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Neutral Bangla summary of what sources report. Empty if insufficient." },
    key_facts: { type: "array", items: attributedItem },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string" },
          text: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["time", "text", "source_ids", "source_urls"],
        additionalProperties: false,
      },
    },
    people: { type: "array", items: attributedItem },
    organizations: { type: "array", items: attributedItem },
    locations: { type: "array", items: attributedItem },
    numbers: { type: "array", items: attributedItem },
    source_agreements: { type: "array", items: attributedItem },
    source_conflicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                claim: { type: "string" },
                source_ids: { type: "array", items: { type: "string" } },
                source_urls: { type: "array", items: { type: "string" } },
              },
              required: ["claim", "source_ids", "source_urls"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "sides"],
        additionalProperties: false,
      },
    },
    unverified_claims: { type: "array", items: attributedItem },
    important_quotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          speaker: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["quote", "speaker", "source_ids", "source_urls"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: warningItem },
  },
  required: [
    "summary",
    "key_facts",
    "timeline",
    "people",
    "organizations",
    "locations",
    "numbers",
    "source_agreements",
    "source_conflicts",
    "unverified_claims",
    "important_quotes",
    "warnings",
  ],
  additionalProperties: false,
};

export const ARTICLE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    excerpt: { type: "string" },
    body: { type: "string", description: "Original Bangla article. Paragraphs separated by blank lines." },
    seo_title: { type: "string" },
    meta_description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    category: { type: "string" },
    article_status: { type: "string", enum: ["ready", "needs_review", "failed"] },
    warnings: { type: "array", items: warningItem },
  },
  required: ["title", "excerpt", "body", "seo_title", "meta_description", "tags", "category", "article_status", "warnings"],
  additionalProperties: false,
};
