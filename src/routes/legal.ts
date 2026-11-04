import { Router } from "express";

const CONTACT = "poralitlit@gmail.com";
const UPDATED = "November 4, 2026";

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - social-poster</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6;color:#222}h1{margin-bottom:0}small{color:#666}</style></head><body><h1>${title}</h1><small>Last updated: ${UPDATED}</small>${body}<hr><p>Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></p></body></html>`;
}

export const TERMS_HTML = page("Terms of Service", `
<p>social-poster ("the App") is a personal publishing tool operated by an individual content creator. It is used only to publish the creator's own original short-drama video clips to the creator's own TikTok, YouTube and Facebook accounts.</p>
<h2>Use of the App</h2>
<ul><li>The App is not offered to the public; only the owner's own accounts are connected.</li>
<li>All content published through the App is original content owned by the creator. The App is not used to repost content belonging to others.</li>
<li>Use of each connected platform remains subject to that platform's own terms (TikTok, YouTube, Facebook).</li></ul>
<h2>Disclaimer</h2>
<p>The App is provided "as is" without warranties of any kind. The operator is not liable for any outage or error of third-party platforms.</p>
<h2>Changes</h2><p>These terms may be updated; the latest version is always available at this page.</p>`);

export const PRIVACY_HTML = page("Privacy Policy", `
<p>This policy explains how social-poster ("the App") handles data. The App is a personal tool used by a single creator to post their own short-drama clips to their own TikTok, YouTube and Facebook accounts.</p>
<h2>Data we collect</h2>
<ul><li>OAuth access/refresh tokens granted by the account owner when connecting a platform.</li>
<li>Basic profile information (such as display name and open ID from TikTok user.info.basic) used only to show which account is connected.</li>
<li>Videos and captions the owner uploads for publishing, and the resulting post IDs/status.</li></ul>
<h2>How data is used</h2>
<p>Tokens are stored encrypted and used only to publish content on the owner's behalf when the owner requests it. Data is never sold, rented or shared with third parties, and is not used for advertising or profiling.</p>
<h2>Retention and deletion</h2>
<p>Data is kept only while the account is connected. The owner can disconnect a platform at any time (or revoke access in the platform's settings), and the stored tokens will be deleted. Deletion requests can be sent to the contact email below.</p>`);

export const legalRouter = Router();

legalRouter.get("/terms", (_req, res) => { res.type("html").send(TERMS_HTML); });
legalRouter.get("/privacy", (_req, res) => { res.type("html").send(PRIVACY_HTML); });

/** คืนเนื้อหาไฟล์ยืนยันโดเมน TikTok ถ้า path ตรงกับ TIKTOK_VERIFY_FILENAME */
export function tiktokVerifyContent(path: string, env = process.env): string | null {
  const name = env.TIKTOK_VERIFY_FILENAME;
  const content = env.TIKTOK_VERIFY_CONTENT;
  if (!name || content === undefined || name.includes("/")) return null;
  return path === "/" + name ? content : null;
}

legalRouter.get(/^\/[^/]+$/, (req, res, next) => {
  const c = tiktokVerifyContent(req.path);
  if (c === null) return next();
  res.type("text/plain").send(c);
});
