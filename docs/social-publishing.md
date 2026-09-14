# Photo Card + Facebook publishing

Human-approved social publishing for The Connect desk.

Automatic Facebook posting is disabled. A staff member must generate a card, edit the caption, review the preview, tick the confirmation box, and click Publish.

## Required environment variables

Server-only. Never put these in client code or the database.

- `META_ACCESS_TOKEN` — Page access token (`pages_manage_posts`, `pages_read_engagement`, `pages_show_list`)
- `META_PAGE_ID` — numeric Facebook Page ID

Optional:

- `META_PAGE_NAME`
- `SITE_URL` — public origin used in captions, e.g. `https://www.theconnect.news`
- `GEMINI_API_KEY` — used only for caption wording; a heuristic caption is used if missing
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` — reused from article image uploads
- Aliases accepted: `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`

## Meta setup

1. Create a Meta app at https://developers.facebook.com
2. Add the Pages product / Graph API
3. Generate a long-lived Page access token
4. Confirm the token can call `GET /{PAGE_ID}?fields=id,name`
5. Set `META_PAGE_ID` and `META_ACCESS_TOKEN` on the host
6. Set `SITE_URL` to the public site origin
7. Open Admin → Desk Settings → Facebook Page and click Recheck connection
8. Status should become `ready`

Publish uses Graph API `v21.0` `POST /{page-id}/photos` with `url` + `caption`.

## Database

Run `supabase/sql/008_social_publishing.sql` (or the matching migration) once in the Supabase SQL editor if those columns are not present.

Existing article rows are not modified.

## Workflow

1. Open the desk story
2. Generate Photo Card (or Preview, then Generate)
3. Generate Caption, edit, Save caption
4. Confirm card + caption + URL + Page
5. Publish to Facebook once
