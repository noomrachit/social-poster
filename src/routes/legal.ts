import { Router } from "express";

const CONTACT = "noomrachit@gmail.com";
const UPDATED = "November 5, 2026";

const NAV = `<nav><a href="/">Home / หน้าแรก</a> · <a href="/privacy">Privacy Policy / นโยบายความเป็นส่วนตัว</a> · <a href="/terms">Terms of Service / ข้อกำหนดการใช้งาน</a></nav>`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - social-poster</title><style>body{font-family:system-ui,-apple-system,"Sarabun","Noto Sans Thai",sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6;color:#222}h1{margin-bottom:0}small{color:#666}nav{margin-bottom:16px;font-size:.9rem}section.th{border-top:1px solid #ddd;margin-top:32px}</style></head><body>${NAV}<h1>${title}</h1><small>Last updated / ปรับปรุงล่าสุด: ${UPDATED}</small>${body}<hr><p>Contact / ติดต่อ: <a href="mailto:${CONTACT}">${CONTACT}</a></p>${NAV}</body></html>`;
}

export const HOME_HTML = page("social-poster", `
<section lang="en">
<p><strong>social-poster</strong> is a personal publishing tool operated by a single content creator (the channel owner). It lets the owner upload and schedule their <em>own</em> original videos to their <em>own</em> YouTube channel using the YouTube Data API, and post the same content to their <em>own</em> Facebook Page (and TikTok account).</p>
<ul><li>The owner signs in with Google and grants YouTube upload permission only for their own channel.</li>
<li>Videos are uploaded via the YouTube Data API v3 (videos.insert) with title, description and privacy status chosen by the owner, either immediately or at a scheduled time.</li>
<li>Posts to Facebook are made to the owner's own Page through the Facebook Graph API.</li>
<li>The App is not offered to the public and does not access other users' data.</li></ul>
<p>Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>
</section>
<section class="th" lang="th">
<p><strong>social-poster</strong> คือเครื่องมือส่วนตัวของผู้สร้างคอนเทนต์คนเดียว (เจ้าของช่อง) ใช้อัปโหลดและตั้งเวลาโพสต์คลิปต้นฉบับ<em>ของตัวเอง</em>ขึ้นช่อง YouTube <em>ของตัวเอง</em> ผ่าน YouTube Data API และโพสต์ลงเพจ Facebook <em>ของตัวเอง</em> (และบัญชี TikTok)</p>
<ul><li>เจ้าของช่องล็อกอินด้วย Google และให้สิทธิ์อัปโหลด YouTube เฉพาะช่องของตัวเองเท่านั้น</li>
<li>อัปโหลดวิดีโอผ่าน YouTube Data API v3 (videos.insert) พร้อมชื่อ คำอธิบาย และสถานะความเป็นส่วนตัวที่เจ้าของเลือก ทันทีหรือตามเวลาที่ตั้งไว้</li>
<li>โพสต์ลงเพจ Facebook ของเจ้าของผ่าน Facebook Graph API</li>
<li>แอปนี้ไม่ได้เปิดให้บุคคลทั่วไปใช้ และไม่เข้าถึงข้อมูลของผู้ใช้อื่น</li></ul>
<p>อ่าน <a href="/privacy">นโยบายความเป็นส่วนตัว</a> และ <a href="/terms">ข้อกำหนดการใช้งาน</a></p>
</section>`);

export const TERMS_HTML = page("Terms of Service / ข้อกำหนดการใช้งาน", `
<section lang="en">
<p>social-poster ("the App") is a personal publishing tool operated by an individual content creator. It is used only to publish the creator's own original videos to the creator's own YouTube channel, Facebook Page and TikTok account.</p>
<h2>Use of the App</h2>
<ul><li>The App is not offered to the public; only the owner's own accounts are connected.</li>
<li>All content published through the App is original content owned by the creator. The App is not used to repost content belonging to others.</li>
<li>Use of each connected platform remains subject to that platform's own terms, including the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, <a href="https://www.facebook.com/terms.php">Meta Terms</a> and TikTok's terms.</li></ul>
<h2>Disclaimer</h2>
<p>The App is provided "as is" without warranties of any kind. The operator is not liable for any outage or error of third-party platforms.</p>
<h2>Changes</h2><p>These terms may be updated; the latest version is always available at this page.</p>
</section>
<section class="th" lang="th">
<h2>ข้อกำหนดการใช้งาน</h2>
<p>social-poster ("แอป") เป็นเครื่องมือเผยแพร่ส่วนตัวของผู้สร้างคอนเทนต์รายบุคคล ใช้เพื่อเผยแพร่วิดีโอต้นฉบับของผู้สร้างเองไปยังช่อง YouTube เพจ Facebook และบัญชี TikTok ของผู้สร้างเองเท่านั้น</p>
<ul><li>แอปไม่ได้เปิดให้บุคคลทั่วไปใช้ เชื่อมต่อเฉพาะบัญชีของเจ้าของเท่านั้น</li>
<li>เนื้อหาทั้งหมดที่เผยแพร่ผ่านแอปเป็นผลงานต้นฉบับของผู้สร้าง ไม่ใช้เพื่อนำเนื้อหาของผู้อื่นมาโพสต์ซ้ำ</li>
<li>การใช้งานแต่ละแพลตฟอร์มยังคงอยู่ภายใต้ข้อกำหนดของแพลตฟอร์มนั้น รวมถึง <a href="https://www.youtube.com/t/terms">ข้อกำหนดในการให้บริการของ YouTube</a> และ <a href="https://www.facebook.com/terms.php">ข้อกำหนดของ Meta</a></li></ul>
<h3>ข้อจำกัดความรับผิด</h3><p>แอปให้บริการ "ตามสภาพ" โดยไม่มีการรับประกันใดๆ ผู้ดูแลไม่รับผิดชอบต่อการขัดข้องหรือข้อผิดพลาดของแพลตฟอร์มภายนอก</p>
<h3>การเปลี่ยนแปลง</h3><p>ข้อกำหนดนี้อาจมีการปรับปรุง ฉบับล่าสุดจะแสดงที่หน้านี้เสมอ</p>
</section>`);

export const PRIVACY_HTML = page("Privacy Policy / นโยบายความเป็นส่วนตัว", `
<section lang="en">
<p>This policy explains how social-poster ("the App") handles data. The App is a personal tool used by a single creator to upload their own videos to their own YouTube channel and post to their own Facebook Page and TikTok account.</p>
<h2>Data we access</h2>
<ul><li><strong>Google / YouTube:</strong> OAuth access and refresh tokens granted by the channel owner, with the YouTube upload scope, and basic channel information (channel ID and title) to show which channel is connected. The App uses the YouTube Data API only to upload videos and set their metadata on the owner's own channel.</li>
<li><strong>Facebook:</strong> the owner's user and Page access tokens and basic Page information (Page ID and name), used only to publish posts and videos to the owner's own Page.</li>
<li><strong>TikTok:</strong> OAuth tokens and basic profile information (display name, open ID).</li>
<li>Videos and captions the owner uploads for publishing, and the resulting post IDs/status.</li></ul>
<h2>How data is used</h2>
<p>Data is used only to upload and publish the owner's own content when the owner requests it (immediately or at a scheduled time). Tokens are stored encrypted on the server and are never displayed or shared. Data is never sold, rented or shared with third parties, and is not used for advertising, profiling or training AI models.</p>
<h2>Google API Services</h2>
<p>The App's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. By using YouTube features you also agree to the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and Google's handling of data is described in the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>. You can revoke the App's access at any time at <a href="https://myaccount.google.com/permissions">Google security settings</a>.</p>
<h2>Retention and deletion</h2>
<p>Data is kept only while the account is connected. The owner can disconnect a platform at any time in the App (or revoke access in the platform's settings), and the stored tokens are deleted. To request deletion of any data, email the contact below; it will be deleted within 30 days.</p>
</section>
<section class="th" lang="th">
<h2>นโยบายความเป็นส่วนตัว</h2>
<p>นโยบายนี้อธิบายการจัดการข้อมูลของ social-poster ("แอป") ซึ่งเป็นเครื่องมือส่วนตัวของผู้สร้างคนเดียว ใช้อัปโหลดวิดีโอของตัวเองขึ้นช่อง YouTube ของตัวเอง และโพสต์ลงเพจ Facebook และบัญชี TikTok ของตัวเอง</p>
<h3>ข้อมูลที่เข้าถึง</h3>
<ul><li><strong>Google / YouTube:</strong> โทเค็น OAuth (access/refresh) ที่เจ้าของช่องอนุญาต พร้อมสิทธิ์อัปโหลด YouTube และข้อมูลช่องพื้นฐาน (ID และชื่อช่อง) ใช้ YouTube Data API เพื่ออัปโหลดวิดีโอและตั้งค่าข้อมูลวิดีโอในช่องของเจ้าของเท่านั้น</li>
<li><strong>Facebook:</strong> โทเค็นผู้ใช้และโทเค็นเพจของเจ้าของ และข้อมูลเพจพื้นฐาน (ID และชื่อเพจ) ใช้เพื่อโพสต์ลงเพจของเจ้าของเท่านั้น</li>
<li><strong>TikTok:</strong> โทเค็น OAuth และข้อมูลโปรไฟล์พื้นฐาน</li>
<li>วิดีโอและคำบรรยายที่เจ้าของอัปโหลด และผลลัพธ์ของโพสต์</li></ul>
<h3>การใช้ข้อมูล</h3>
<p>ใช้ข้อมูลเพื่ออัปโหลดและเผยแพร่เนื้อหาของเจ้าของเมื่อเจ้าของสั่งเท่านั้น โทเค็นถูกเข้ารหัสเก็บบนเซิร์ฟเวอร์ ไม่แสดงหรือแชร์ให้ใคร ไม่ขาย ไม่ให้เช่า ไม่แบ่งปันกับบุคคลที่สาม และไม่ใช้เพื่อโฆษณาหรือวิเคราะห์โปรไฟล์</p>
<h3>Google API Services</h3>
<p>การใช้และการส่งต่อข้อมูลที่ได้รับจาก Google API เป็นไปตาม <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a> รวมถึงข้อกำหนด Limited Use การใช้ฟีเจอร์ YouTube ถือว่ายอมรับ <a href="https://www.youtube.com/t/terms">ข้อกำหนดในการให้บริการของ YouTube</a> และดู <a href="https://policies.google.com/privacy">นโยบายความเป็นส่วนตัวของ Google</a> ประกอบ ยกเลิกสิทธิ์ได้ทุกเมื่อที่ <a href="https://myaccount.google.com/permissions">การตั้งค่าความปลอดภัยของ Google</a></p>
<h3>การเก็บรักษาและการลบข้อมูล</h3>
<p>เก็บข้อมูลเฉพาะขณะที่บัญชียังเชื่อมต่ออยู่ เจ้าของยกเลิกการเชื่อมต่อได้ทุกเมื่อ และโทเค็นที่เก็บไว้จะถูกลบ หากต้องการให้ลบข้อมูล ส่งอีเมลมาที่อยู่ด้านล่าง จะลบภายใน 30 วัน</p>
</section>`);

export const legalRouter = Router();

legalRouter.get("/", (_req, res) => { res.type("html").send(HOME_HTML); });
legalRouter.get("/app", (_req, res) => { res.redirect("/app.html"); });
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
