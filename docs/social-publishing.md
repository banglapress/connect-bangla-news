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

This app publishes only to our own Page. It does not request `publish_actions` and is not a consumer Share button.

1. Open https://developers.facebook.com and use the existing Meta app
2. Add the Pages product if it is missing
3. Open Graph API Explorer
4. Select that Meta app
5. In the token user/page dropdown, select **the Facebook Page** (not a personal user)
6. Grant only: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
7. Generate Access Token
8. Call `GET /{PAGE_ID}?fields=id,name` — it must return the Page
9. If Explorer issued a User token instead, call `GET /me/accounts` and copy that Page's `access_token`
10. Set `META_PAGE_ID` and `META_ACCESS_TOKEN` on the host (never in chat or the database)
11. Set `SITE_URL` to the public site origin
12. Open Admin → Desk Settings → Facebook Page and click Recheck connection
13. Status should become `ready`

Publish uses Graph API `v21.0` `POST /{page-id}/photos` with `url` + `caption` and a Page access token.

## Database

Run `supabase/sql/008_social_publishing.sql` (or the matching migration) once in the Supabase SQL editor if those columns are not present.

Existing article rows are not modified.

## Workflow

1. Open the desk story
2. Generate Photo Card (or Preview, then Generate)
3. Generate Caption, edit, Save caption
4. Confirm card + caption + URL + Page
5. Publish to Facebook once
