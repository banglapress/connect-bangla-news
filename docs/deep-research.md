# Deep multi-source research + long-form article engine

Manual flow remains two Gemini calls:

1. Prepare Research \u2014 local source notes + one Gemini dossier call
2. Generate / Regenerate article \u2014 one Gemini article call from the stored dossier

Changing article depth does not recollect sources and does not rerun research.

Available source text is only:

- RSS / Atom feed text already collected (`excerpt`, `raw_text`, `content:encoded`)
- Google News snippets already stored
- titles, URLs, times, publisher names

The system does not scrape publisher pages or bypass paywalls.

Content levels:

- full: long stored feed text (>= 1500 characters)
- partial: snippet / short feed text
- metadata_only: title/URL only

Run `supabase/sql/009_deep_research.sql` in the Supabase SQL editor after deploy.
