# TikTok setup status (2026-11-04)

## Done
- TikTok developer app "social-poster" created (ID 7704141490188077076), Individual, status Draft.
- Products: Login Kit + Content Posting API (Direct Post on). Scopes: user.info.basic, video.upload, video.publish.
- Redirect URI: https://app-production-a4bb.up.railway.app/auth/tiktok/callback
- Web URL: https://app-production-a4bb.up.railway.app/
- Terms: /terms, Privacy: /privacy (src/routes/legal.ts). Category: Entertainment. Icon: 1024x1024 PNG.
- URL prefix https://app-production-a4bb.up.railway.app/ verified via signature file
  (served from env TIKTOK_VERIFY_FILENAME / TIKTOK_VERIFY_CONTENT).
- Code: /auth/tiktok/start (PKCE), /auth/tiktok/callback, token refresh, src/providers/tiktok.ts
  (creator_info -> video/init FILE_UPLOAD chunked -> status poll), revoke on disconnect,
  dashboard button "+ เชื่อม TikTok". 55 tests pass.
- Railway env set: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_VERIFY_FILENAME, TIKTOK_VERIFY_CONTENT.

## Pending
- Production app form not saved: TikTok requires a demo video before Save/Submit.
- Trying Sandbox mode to connect "pora" and test-post (SELF_ONLY until audited).
- Record demo video (login + post flow), upload, Save, then Submit for review (user approves submit).
- If login rejects code_challenge, switch PKCE challenge from hex to base64url.
