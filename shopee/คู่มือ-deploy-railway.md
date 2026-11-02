# คู่มือ Deploy ขึ้น Railway (เข้าใช้งานจาก iPhone ผ่าน Safari)

แนวทางนี้: โค้ดรันอยู่บนเซิร์ฟเวอร์ของ Railway (ทำงาน 24 ชม. ไม่ต้องเปิดคอมทิ้งไว้)
ส่วน iPhone ใช้แค่เปิดเว็บผ่าน Safari เหมือนเข้าเว็บทั่วไป — เร็ว เสถียร ไม่มีข้อจำกัดของ iOS

```
[โค้ดใน GitHub] → [Railway ดึงโค้ดไป build เป็น container] → [ได้ URL สาธารณะ] → [เปิดผ่าน Safari บน iPhone]
```

---

## ขั้นที่ 1: อัปโหลดโค้ดขึ้น GitHub

ถ้ายังไม่เคยทำ ให้สร้าง repository ใหม่ก่อน (ผ่านเว็บ github.com กด "New repository"
ตั้งชื่อเช่น `shopee-auto` เลือก **Private** เพราะโค้ดมีข้อมูลระบบ affiliate ของคุณ)

จากนั้นในเครื่องคอมพิวเตอร์ (ต้องมี git ติดตั้งแล้ว) เข้าไปที่โฟลเดอร์โปรเจกต์แล้วพิมพ์:

```bash
cd shopee-auto
git init
git add .
git commit -m "shopee-auto with web dashboard"
git branch -M main
git remote add origin https://github.com/<ชื่อผู้ใช้ของคุณ>/shopee-auto.git
git push -u origin main
```

⚠️ **ไฟล์ `.env` จะไม่ถูกอัปโหลดโดยอัตโนมัติ** (ถูกกันไว้ใน `.gitignore` แล้ว) เพราะมี
secret ของบัญชีคุณอยู่ข้างใน — ปลอดภัยแล้ว ไม่ต้องกังวล ค่าต่างๆ จะไปกรอกในหน้าเว็บ
Railway แทน (ขั้นที่ 3)

---

## ขั้นที่ 2: สร้างโปรเจกต์ใน Railway จาก GitHub repo

1. เข้า https://railway.app แล้ว login
2. กด **New Project** → **Deploy from GitHub repo**
3. เลือก repo `shopee-auto` ที่เพิ่ง push ไป
4. Railway จะเจอ `Dockerfile` ในโปรเจกต์แล้ว build ให้อัตโนมัติ (ไม่ต้องตั้งค่าอะไรเพิ่ม
   ในขั้นนี้ รอ build เสร็จก่อน อาจใช้เวลา 2-5 นาที เพราะต้องติดตั้ง ffmpeg และไลบรารีวิดีโอ)

---

## ขั้นที่ 3: ตั้งค่า Environment Variables ใน Railway

ในหน้าโปรเจกต์ Railway → เลือก service → แท็บ **Variables** → กรอกค่าเหล่านี้ทีละตัว
(เหมือนกับที่เคยกรอกในไฟล์ `.env`):

| ชื่อตัวแปร | ค่าที่ใส่ |
|---|---|
| `SHOPEE_APP_ID` | App ID จาก Shopee affiliate |
| `SHOPEE_APP_SECRET` | App Secret จาก Shopee affiliate |
| `IMAGE_ALLOWED_HOSTS` | ชื่อโฮสต์ภาพที่ยืนยันจาก API response |
| `APP_USERNAME` | ตั้งชื่อผู้ใช้เข้าแดชบอร์ด เช่น `admin` |
| `APP_PASSWORD` | ตั้งรหัสผ่านเข้าแดชบอร์ด (ตั้งให้คาดเดายาก — **จำเป็นมาก** เพราะ URL จะเป็นสาธารณะ) |
| `TIKTOK_ACCESS_TOKEN`, `GOOGLE_REFRESH_TOKEN` ฯลฯ | ถ้าจะโพสต์จริง ค่อยกรอกทีหลังได้ |

**สำคัญ:** `APP_USERNAME`/`APP_PASSWORD` คือสิ่งที่ผมเพิ่มเข้ามาในแอปเพื่อกันคนแปลกหน้า
เข้าเว็บ — ถ้าไม่ตั้งสองตัวนี้ ใครก็ตามที่รู้ URL จะกดปุ่มดึงสินค้า/อนุมัติ/โพสต์แทนคุณได้เลย

กรอกเสร็จ Railway จะ redeploy service ให้อัตโนมัติ

---

## ขั้นที่ 4: ตั้งค่า Storage ถาวร (กันวิดีโอ/ฐานข้อมูลหายตอน redeploy)

โดยปกติไฟล์ในคอนเทนเนอร์ของ Railway จะหายทุกครั้งที่ deploy ใหม่ ต้องผูก **Volume**
ให้เก็บฐานข้อมูลและวิดีโอไว้ถาวร:

1. ในหน้า service → แท็บ **Settings** → เลื่อนหา **Volumes** → กด **Add Volume**
2. ตั้ง mount path เป็น `/app/data`
3. กลับไปที่แท็บ **Variables** เพิ่มตัวแปรเหล่านี้เพื่อให้แอปเก็บไฟล์ลง volume แทนที่จะ
   เก็บในคอนเทนเนอร์ชั่วคราว:

| ชื่อตัวแปร | ค่า |
|---|---|
| `DATABASE_PATH` | `/app/data/state.db` |
| `OUTPUT_DIR` | `/app/data/out` |
| `IMAGE_DIR` | `/app/data/assets/products` |

---

## ขั้นที่ 5: เปิดใช้งานจาก iPhone

1. ในหน้า service Railway → แท็บ **Settings** → **Networking** → กด **Generate Domain**
   จะได้ URL แบบ `https://shopee-auto-production-xxxx.up.railway.app`
2. เปิด Safari บน iPhone พิมพ์ URL นั้น
3. เบราว์เซอร์จะถามชื่อผู้ใช้/รหัสผ่าน (ตามที่ตั้งไว้ในขั้นที่ 3) — กรอกแล้วเข้าใช้ได้ปกติ
   เหมือนหน้าเว็บที่ทดสอบตอนอยู่ในเครื่อง

เพิ่มเป็นไอคอนหน้าจอโฮมได้: กดปุ่มแชร์ใน Safari → "เพิ่มไปยังหน้าจอโฮม" จะได้ไอคอน
เปิดแอปได้เหมือนแอปจริงเลย

---

## ค่าใช้จ่ายคร่าวๆ

Railway คิดเงินตามการใช้จริง (usage-based) แผน Hobby มีเครดิตฟรีให้ต่อเดือน
งานตัดวิดีโอเป็นงานที่ใช้ CPU สูงตอนรัน แต่เวลาที่เหลือ (ตอนไม่ได้กดปุ่ม) จะใช้ทรัพยากร
น้อยมาก ถ้าใช้งานแค่วันละไม่กี่คลิป ปกติจะอยู่ในเครดิตฟรีหรือเสียเพิ่มเล็กน้อย

## ถ้าจะอัปเดตโค้ดภายหลัง

แก้โค้ดในเครื่อง แล้ว:

```bash
git add .
git commit -m "อัปเดต"
git push
```

Railway จะ build และ deploy เวอร์ชันใหม่ให้อัตโนมัติทุกครั้งที่ push ขึ้น GitHub
