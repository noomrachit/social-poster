# social-poster

ระบบโพสต์ข้ามแพลตฟอร์มของตัวเอง: โพสต์ครั้งเดียว ยิงไปทุกแพลตฟอร์มที่เชื่อมไว้ และคืนผลลัพธ์แยกรายแพลตฟอร์ม (ไม่รวมเป็นสำเร็จ/ไม่สำเร็จคำเดียว) — ได้แรงบันดาลใจจาก Postiz แต่เขียนขึ้นใหม่เอง

## สถานะ

| แพลตฟอร์ม | สถานะ |
|---|---|
| YouTube | ใช้งานได้ (OAuth ของ Google ไม่ต้องรอ review) |
| Facebook | ใช้ได้ — โพสต์ Reels/วิดีโอลงเพจ (Development mode ได้ถ้าเป็นแอดมินทั้งแอปและเพจ) ตั้งค่า `FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI` แล้วเปิด `/auth/facebook/start?token=<ADMIN_TOKEN>` ([docs/facebook-setup.md](docs/facebook-setup.md)) |
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
2. เปิด `https://<โดเมนแอป>/auth/youtube/start?token=<ADMIN_TOKEN>` ในเบราว์เซอร์ แล้วกดอนุญาต (หรือกด "+ เชื่อม YouTube" ในหน้าเว็บหลังใส่ token) — ไม่มี token จะได้ 401
   - ตั้ง `ALLOWED_YT_CHANNEL_IDS=UCxxx,UCyyy` เพื่อยอมรับเฉพาะช่องของคุณ (ว่าง = ทุกช่อง)
   - Health check: `GET /health` คืน `{"ok":true}` หรือ 503 ถ้าต่อฐานข้อมูลไม่ได้ (ตั้งใน Railway → Settings → Healthcheck Path)
   - โพสต์ที่ค้าง `publishing` เกิน 15 นาทีจะถูกเปลี่ยนเป็น `failed` อัตโนมัติ

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
- ตั้ง `ANTHROPIC_API_KEY` บนเซิร์ฟเวอร์เพื่อให้ Claude เขียนสคริปต์ (ภาพฉากและเสียงพากย์ยังใช้ `XAI_API_KEY` ถ้าตั้งไว้ ไม่บังคับ) — ไม่ตั้งก็ใช้ได้ (ร่างในเครื่อง + เสียงของเครื่อง)
- API ฝั่งเซิร์ฟเวอร์: `POST /studio-api/draft`, `POST /studio-api/speak` (ต้องมี `x-admin-token`)
- โค้ดหน้าเว็บอยู่ที่ `src/studio-client/` และคอมไพล์ไป `public/studio/` ด้วย `npm run build`
- การอัดคลิปเป็นแบบเรียลไทม์ (คลิป 30 วินาที = อัด 30 วินาที) และห้ามสลับแท็บระหว่างอัด

## API สำหรับแดชบอร์ดต่างโดเมน (`CORS_ORIGINS` และ `DASHBOARD_TOKEN`)

ตั้งสองตัวแปรนี้บน Railway เท่านั้น (ไม่ตั้ง = พฤติกรรมเดิมทุกอย่าง)

- `CORS_ORIGINS` — รายชื่อโดเมนแดชบอร์ดที่อนุญาต คั่นด้วยจุลภาค เช่น `https://a.example,https://b.example` (ห้ามใช้ `*`) ไม่ตั้ง = ปิด CORS ทั้งหมด ตอบ preflight (OPTIONS) ก่อนตรวจ token และอนุญาต header `x-dashboard-token`, `x-admin-token`, `content-type`
- `DASHBOARD_TOKEN` — โทเคนสิทธิ์จำกัดส่งผ่าน header `x-dashboard-token` เข้าได้เฉพาะ `GET /integrations`, `POST /media`, `POST /posts`, `GET /posts`, `GET /posts/:id` ส่วนเส้นทางอื่นได้ 403 ไม่ตั้งค่า = ปฏิเสธทุกคำขอที่ใช้โทเคนนี้
  - `POST /posts` ต้องส่ง `mode` เป็น `draft` หรือ `schedule` เท่านั้น (ห้าม `now`) และ `privacyStatus` ถูกบังคับเป็น `private` เสมอ (ค่าอื่นที่ส่งมา เช่น `public`/`unlisted` ถูกทับเป็น `private`)
  - `ADMIN_TOKEN` เดิมทำงานเหมือนเดิมทุกอย่าง

### หน้าแดชบอร์ดทำคลิป (`/dashboard.html`)

แอปเสิร์ฟหน้าแดชบอร์ดเองที่ `https://<โดเมนแอป>/dashboard.html` (ไฟล์ `public/dashboard.html`) เปิดจากโดเมนเดียวกับ API จึงไม่ต้องตั้ง `CORS_ORIGINS` ช่องที่อยู่ฐานของแอปจะเป็นโดเมนนี้ให้อัตโนมัติ

- ตัวหน้าเว็บเปิดสาธารณะได้ ไม่มีโทเคนฝังอยู่ในไฟล์ แต่ทุกคำขอ API ต้องแนบ `DASHBOARD_TOKEN` (กรอกในหน้า เก็บใน sessionStorage ของแท็บ) ไม่มีโทเคนจะได้ 401
- ล็อกอินหน้าจอของแดชบอร์ดเป็นการล็อกฝั่งเบราว์เซอร์เท่านั้น ไม่ใช่ความปลอดภัยจริง ความปลอดภัยจริงอยู่ที่โทเคนของ API
- ยังเปิดจากโดเมนอื่นได้ถ้าตั้ง `CORS_ORIGINS`

## Deploy บน Railway

1. สร้าง Project ใหม่ใน Railway, เชื่อม repo นี้
2. แนบ Postgres plugin (Railway จะตั้ง `DATABASE_URL` ให้อัตโนมัติ)
3. ตั้ง ENV: `TOKEN_ENCRYPTION_KEY`, `APP_BASE_URL` (ใส่ URL ที่ Railway ออกให้), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
4. Build command: `npm run build` / Start command: `npm run build && npm run migrate && npm start` (หรือรัน `npm run migrate` แยกครั้งแรกผ่าน Railway shell)

## โมดูลในรีโป

- `shopee/` — Shopee Affiliate Auto (Python: ดึงสินค้า → เรนเดอร์วิดีโอ → คิวอนุมัติ → โพสต์) deploy แยกเป็น service ของตัวเอง ดู `shopee/README.md`

## ศูนย์ควบคุมเอเจนต์ (`/agents.html`)

เอเจนต์ 12 ตัวทำงานต่อกันเป็นไปป์ไลน์ 5 ขั้น (เก่งวางแผน → คอนเทนต์/เรื่องเล่า → SEO/พร้อมต์ภาพ → สเปกแอป/ตรวจบั๊ก → ส่งออก/ตรวจคุณภาพ) ใช้ Claude ผ่านเซิร์ฟเวอร์

- ตั้ง `ANTHROPIC_API_KEY` ใน Railway Variables (ไม่บังคับ `ANTHROPIC_MODEL`: claude-sonnet-5-5 / claude-opus-5-5 / claude-haiku-5-5)
- API: `GET /agents-api/config`, `POST /agents-api/test`, `POST /agents-api/step` (ต้องมี `x-admin-token`) หน้าเว็บเรียกทีละขั้นเพื่อแสดงความคืบหน้า
- ผลลัพธ์อยู่ในหน้าเว็บ คัดลอกหรือดาวน์โหลด .md ได้ ยังไม่บันทึกลงฐานข้อมูล
