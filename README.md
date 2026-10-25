# social-poster

ระบบโพสต์ข้ามแพลตฟอร์มของตัวเอง: โพสต์ครั้งเดียว ยิงไปทุกแพลตฟอร์มที่เชื่อมไว้ และคืนผลลัพธ์แยกรายแพลตฟอร์ม (ไม่รวมเป็นสำเร็จ/ไม่สำเร็จคำเดียว) — ได้แรงบันดาลใจจาก Postiz แต่เขียนขึ้นใหม่เอง

## สถานะ

| แพลตฟอร์ม | สถานะ |
|---|---|
| YouTube | ใช้งานได้ (OAuth ของ Google ไม่ต้องรอ review) |
| Facebook | stub — ต้องสมัคร Meta App + รอ App Review ก่อน ([docs/facebook-setup.md](docs/facebook-setup.md)) |
| TikTok | stub — ต้องสมัคร TikTok Developer App + รอ App Review ก่อน ([docs/tiktok-setup.md](docs/tiktok-setup.md)) |

เพิ่มแพลตฟอร์มใหม่: implement `SocialProvider` ใน `src/providers/` แล้วเพิ่มเข้า `src/providers/registry.ts`

## รันตอนพัฒนา (local)

```bash
cp .env.example .env     # แล้วใส่ DATABASE_URL, TOKEN_ENCRYPTION_KEY, GOOGLE_CLIENT_ID/SECRET
npm install
npm run migrate:dev      # สร้างตารางในฐานข้อมูล
npm run dev
```

สร้าง `TOKEN_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## เชื่อมบัญชี YouTube

1. สร้าง OAuth client ที่ https://console.cloud.google.com/apis/credentials (ประเภท Web application)
   Redirect URI: `${APP_BASE_URL}/auth/youtube/callback`
2. เปิด `https://<โดเมนแอป>/auth/youtube/start` ในเบราว์เซอร์ แล้วกดอนุญาต

## โพสต์

```bash
curl -X POST https://<โดเมนแอป>/posts \
  -H 'Content-Type: application/json' \
  -d '{
    "content": "ชื่อวิดีโอ\nรายละเอียดวิดีโอ",
    "mediaUrls": ["https://example.com/video.mp4"]
  }'
```

Response (ตัวอย่าง):
```json
{
  "postId": "abc123",
  "results": [
    { "integration": "yt-xyz", "platform": "youtube", "status": "success", "postId": "yt-video-id" },
    { "integration": "fb-xyz", "platform": "facebook", "status": "error", "error": "Facebook provider ยังไม่เปิดใช้งาน..." }
  ]
}
```

## Deploy บน Railway

1. สร้าง Project ใหม่ใน Railway, เชื่อม repo นี้
2. แนบ Postgres plugin (Railway จะตั้ง `DATABASE_URL` ให้อัตโนมัติ)
3. ตั้ง ENV: `TOKEN_ENCRYPTION_KEY`, `APP_BASE_URL` (ใส่ URL ที่ Railway ออกให้), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
4. Build command: `npm run build` / Start command: `npm run build && npm run migrate && npm start` (หรือรัน `npm run migrate` แยกครั้งแรกผ่าน Railway shell)
