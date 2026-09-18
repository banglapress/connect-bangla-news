# AI Desk Automation

The AI Desk now uses a persistent queue and retry-safe processing model.

## Schedule

GitHub Actions is the primary scheduler for the Hobby plan:

- 06:15 Bangladesh time
- 18:15 Bangladesh time

The workflow is in `.github/workflows/desk-auto-draft.yml`.

Vercel Cron remains as a daily backup because Vercel Hobby Cron is once per day.

## One-time setup

Add this GitHub repository secret:

`DESK_CRON_SECRET`

Set its value to the same secret used by the Vercel production deployment under either:

- `DESK_CRON_SECRET`
- or `CRON_SECRET`

Do not put the secret into the workflow file.

## Queue behavior

The auto-draft pipeline now:

1. ingests active RSS sources;
2. recovers stories whose processing lock became stale;
3. selects retryable `new` stories instead of using an 18-hour creation cutoff;
4. finds related coverage;
5. requires at least two sources before research;
6. retries transient Gemini/API failures;
7. retries failed stories with backoff;
8. generates the article draft;
9. clears the processing lock after success.

The default batch is 4 stories per run and can be increased with the Vercel environment variable:

`DESK_AUTO_LIMIT`

Allowed range: 1–8.

## Required Supabase migration

Because the project does not automatically run Supabase migrations during `npm run build`, run the new SQL migration once in Supabase SQL Editor:

`supabase/migrations/20260918235000_auto_draft_queue_recovery.sql`

This adds the retry/queue metadata used by the new code.

## Manual test

The GitHub Actions workflow supports `workflow_dispatch`, so you can run it manually from:

GitHub → Actions → The Connect AI Desk Auto Draft → Run workflow

The production endpoint is protected by the same cron secret used by Vercel.
