# Deep multi-source research + long-form article engine

Manual flow remains two Gemini calls:

1. Prepare Research — local source notes + one Gemini dossier call
2. Generate / Regenerate article — one Gemini article call from the stored dossier

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

Article depth aims (only when the stored dossier/source notes support it):

- Brief: about 400 words (350–500)
- Standard: about 750 words (600–900)
- Detailed: about 1050 words (900–1300)
- Comprehensive: about 1500 words, 1400–1600 when material supports it (1200–1800)

A 100–200 word recap on Standard/Detailed/Comprehensive is marked needs_review. Do not invent facts to hit the count.

The article Gemini call receives:

- the packed structured dossier, including `source_notes`
- the current source list and available feed/snippet text
- a concrete word target for the selected depth

Quality metrics stored on the story include requested depth, target word count, actual word count, source count, source utilization, below_target, and quality status.

Run `supabase/sql/009_deep_research.sql` in the Supabase SQL editor after deploy.
