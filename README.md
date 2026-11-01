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

## ฉบับร่างและตั้งเวลา

`POST /posts` รับ `mode` เพิ่ม (ค่าเริ่มต้น `now` = โพสต์ทันทีแบบเดิม):

| mode | ผล |
|---|---|
| `now` | โพสต์ทันที รอผลทุกแพลตฟอร์ม |
| `draft` | บันทึกเป็นร่าง ยังไม่โพสต์ |
| `schedule` | ต้องใส่ `scheduledAt` (ISO 8601) ระบบโพสต์เองเมื่อถึงเวลา (ตรวจทุก 60 วินาที) |

- `POST /posts/:id/publish` — อนุมัติแล้วโพสต์ร่าง/โพสต์ตั้งเวลาทันที (ยิงซ้ำไม่ได้)
- สถานะโพสต์: `draft` → `scheduled` → `publishing` → `published` (มีอย่างน้อย 1 แพลตฟอร์มสำเร็จ) หรือ `failed`

## เชื่อมกับยิงแอด (noomrachit/yingad-links)

`POST /posts/import/yingad` ดึง `daily-pick/YYYY-MM-DD.md` ที่เดชา (Claude) ทำทุกเช้า → ร่าง YouTube Shorts (คลิป + ชื่อคลิป + แคปชัน + ข้อความเปิดเผยลิงก์นายหน้า) ไม่โพสต์จนกว่าจะ publish

```bash
curl -X POST https://<โดเมนแอป>/posts/import/yingad -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"date":"2026-10-19"}'
```

- ไม่ใส่ `date` = วันนี้ (Asia/Jerusalem) · ใส่ `scheduledAt` = ตั้งเวลาเลย · เรียกซ้ำวันเดิมได้ คืนร่างเดิม
- ผ่าน MCP: `import_yingad` → `publish_post`
- หน้าเว็บของยิงแอดย้ายมาไว้ที่ `/yingad/` (หน้ารวมลิงก์) และ `/yingad/studio/` (เครื่องมือแคปชัน/คลิป) ส่วนแนวทางช่องและตัวทำชุดรายวันอยู่ที่ `yingad/` ดู [yingad/README.md](yingad/README.md)

## สตูดิโอสร้างคลิป (`/studio.html`)

พิมพ์หัวข้อ → ได้คลิปแนวตั้ง 9:16 (สคริปต์ ภาพเคลื่อนไหว เสียงพากย์ไทย) → อัดเป็นไฟล์ในเบราว์เซอร์ → อัปโหลดผ่าน `POST /media` แล้วโพสต์ผ่าน `POST /posts` (YouTube Shorts) ในหน้าเดียว

- ใช้ `ADMIN_TOKEN` เดิม (กรอกในหน้า เก็บใน sessionStorage) ไม่มี token ฝังในโค้ดฝั่งเบราว์เซอร์
- ตั้ง `XAI_API_KEY` บนเซิร์ฟเวอร์เพื่อให้ Grok เขียนสคริปต์/สร้างภาพ/เสียงพากย์ — ไม่ตั้งก็ใช้ได้ (ร่างในเครื่อง + เสียงของเครื่อง)
- API ฝั่งเซิร์ฟเวอร์: `POST /studio-api/draft`, `POST /studio-api/speak` (ต้องมี `x-admin-token`)
- โค้ดหน้าเว็บอยู่ที่ `src/studio-client/` และคอมไพล์ไป `public/studio/` ด้วย `npm run build`
- การอัดคลิปเป็นแบบเรียลไทม์ (คลิป 30 วินาที = อัด 30 วินาที) และห้ามสลับแท็บระหว่างอัด

## Deploy บน Railway

1. สร้าง Project ใหม่ใน Railway, เชื่อม repo นี้
2. แนบ Postgres plugin (Railway จะตั้ง `DATABASE_URL` ให้อัตโนมัติ)
3. ตั้ง ENV: `TOKEN_ENCRYPTION_KEY`, `APP_BASE_URL` (ใส่ URL ที่ Railway ออกให้), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
4. Build command: `npm run build` / Start command: `npm run build && npm run migrate && npm start` (หรือรัน `npm run migrate` แยกครั้งแรกผ่าน Railway shell)
