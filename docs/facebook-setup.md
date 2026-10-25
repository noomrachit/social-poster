# สมัคร Facebook Developer App (ยังไม่ implement provider จริง)

ขั้นตอนคร่าวๆ สำหรับทีหลัง เมื่อพร้อมจะเปิดใช้ Facebook:

1. ไปที่ https://developers.facebook.com/apps → สร้างแอปใหม่ ประเภท "Business"
2. เพิ่ม Product: "Facebook Login" และ (ถ้าจะโพสต์ไป Page) "Pages API"
3. ขอ permission ต่อไปนี้ผ่าน App Review (ต้องอัดวิดีโอสาธิตการใช้งานจริงส่งให้ Meta ตรวจ ใช้เวลาหลักสัปดาห์ต่อ permission):
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement`
4. ตั้งค่า OAuth Redirect URI เป็น `${APP_BASE_URL}/auth/facebook/callback`
5. ใส่ `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` ใน ENV ของ Railway
6. เขียน `src/routes/auth.ts` เพิ่ม route `/auth/facebook/start` และ `/auth/facebook/callback` (รูปแบบเดียวกับ YouTube)
7. เขียน `src/providers/facebook.ts` ให้เรียก Graph API `POST /{page-id}/feed` จริง แทน stub ปัจจุบัน

อ้างอิง: https://developers.facebook.com/docs/pages/publishing
