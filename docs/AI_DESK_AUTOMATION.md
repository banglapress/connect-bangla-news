# AI Desk Automation

The AI Desk uses GitHub Actions as the primary high-frequency scheduler and Supabase as the persistent queue/state store.

## Schedule

The free-tier pilot scheduler runs every 30 minutes:

- minute 7 and 37 of every hour (UTC)
- one queue worker per run to reduce quota pressure

Each scheduled run:

1. ingests active RSS sources;
2. starts one queue worker only if ingest succeeds;
3. the worker claims one story conditionally before processing;
4. retries transient AI/API failures with backoff;
5. creates a draft article only — never auto-publishes.

The current target is 15–20 unique final drafts/day, with a hard cap of 20. Quality takes priority over filling the daily count.

The GitHub workflow is in:

`.github/workflows/desk-auto-draft.yml`

Vercel Cron remains only as a daily backup because Vercel Hobby Cron is limited to once per day. The frequent scheduler should therefore be GitHub Actions.

## Throughput model

The worker is intentionally split from ingest so several workers can process different stories at the same time.

The target operating model is:

- 4 parallel workers per scheduled run
- 1 story per worker
- 15-minute scheduler cadence
- up to 96 scheduler cycles/day
- up to 384 worker story slots/day before retries (96 cycles × 4 workers); actual drafts depend on Gemini API rate limits, source availability, retries and execution time

For routine one-source stories, the auto-draft path allows a single source and defaults to a brief article. These drafts are explicitly marked for review. Stories with two or more sources use the normal standard-depth path unless an article depth was already selected.

## One-time setup

Add this GitHub repository secret:

`DESK_CRON_SECRET`

Set its value to the same secret used by the Vercel production deployment under either:

- `DESK_CRON_SECRET`
- or `CRON_SECRET`

Do not put the secret into the workflow file.

## Manual test

The workflow supports `workflow_dispatch`.

GitHub → Actions → The Connect AI Desk Auto Draft → Run workflow

A manual run executes the ingest step and then one worker if ingest succeeds.

## Queue recovery

The auto-draft pipeline recovers stale `researching` rows after 30 minutes and retries failed stories using `auto_attempts` and `auto_next_attempt_at`.

The queue worker claims stories with a conditional update so concurrent workers do not intentionally process the same story.

## Required Supabase migration

The existing auto-draft queue metadata migration remains required:

`supabase/migrations/20260918235000_auto_draft_queue_recovery.sql`

Run it once in the Supabase SQL Editor if it has not already been applied.

