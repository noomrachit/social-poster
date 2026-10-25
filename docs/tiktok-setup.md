# สมัคร TikTok Developer App (ยังไม่ implement provider จริง)

ขั้นตอนคร่าวๆ สำหรับทีหลัง เมื่อพร้อมจะเปิดใช้ TikTok:

1. ไปที่ https://developers.tiktok.com/apps → สร้างแอปใหม่
2. เปิดใช้ Product: "Content Posting API"
3. ขอ scope `video.publish` ผ่าน App Review (ต้องมีบัญชี TikTok Business และรอการตรวจ)
4. ตั้งค่า OAuth Redirect URI เป็น `${APP_BASE_URL}/auth/tiktok/callback`
5. ใส่ `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` ใน ENV ของ Railway
6. เขียน `src/routes/auth.ts` เพิ่ม route `/auth/tiktok/start` และ `/auth/tiktok/callback`
7. เขียน `src/providers/tiktok.ts` ให้เรียก Content Posting API จริง (`/v2/post/publish/video/init/`) แทน stub ปัจจุบัน
   - หมายเหตุ: TikTok ต้องอัปโหลดไฟล์วิดีโอเป็น chunk ไม่ใช่ URL ตรงแบบ YouTube

อ้างอิง: https://developers.tiktok.com/doc/content-posting-api-get-started
