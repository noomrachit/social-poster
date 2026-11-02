# Shopee Affiliate Auto (Thailand)

> **ย้ายมาอยู่ใน repo social-poster (โฟลเดอร์ `shopee/`)** — โค้ดทั้งหมดเหมือนเดิม ยังไม่ได้ผูกกับ social-poster ตัวหลัก
> deploy เป็น Railway service แยก: ตั้ง Root Directory เป็น `shopee` (ใช้ `shopee/Dockerfile`) แอปหลัก (Node) ไม่ได้รับผลกระทบ
> repo เดิม `noomrachit/shopee-affiliate-auto` ยังไม่ถูกลบหรือแก้ไข


โครงร่าง Python: ดึงข้อมูลสินค้า → ดาวน์โหลดภาพ → MoviePy → คิวรออนุมัติ

## สถานะและข้อจำกัดสำคัญ

เวอร์ชันนี้เพิ่มโมดูลดาวน์โหลดหลายภาพและทดสอบแบบจำลอง ไม่ได้ทดสอบกับบัญชี Shopee ไทยจริง ไม่รับรองว่าระบบเดิมทำงานครบวงจร และยังไม่ได้โพสต์ไป TikTok หรือ YouTube

จากโค้ดเดิม Query ขอเพียง `imageUrl` เท่านั้น: ไม่พบข้อมูลยืนยันฟิลด์ gallery ของ Affiliate API ไทยในข้อมูลที่มี จึงไม่เพิ่มฟิลด์สมมติ ไม่ scrape หน้าเว็บ ไม่ประกอบ CDN URL จาก image ID และไม่เปลี่ยนไปใช้ Seller API โดยพลการ

ค่าเริ่มต้นจึงดาวน์โหลดได้หนึ่งภาพต่อสินค้า ฟังก์ชันหลายภาพพร้อมใช้เมื่อได้รับ response/query ที่ยืนยันว่าบัญชีมีสิทธิ์อ่านรายการ URL ภาพจริง การกำหนด JSON path อย่างเดียวไม่ได้ทำให้ API คืนฟิลด์เพิ่ม

## ติดตั้งและเริ่มต้น

รันจากโฟลเดอร์ `shopee-auto`:

```bash
cp .env.example .env
pip install -r requirements.txt
python -m unittest discover -s tests -v
```

กรอก credential ใน `.env` บนเครื่องหรือ secret store ของคุณเท่านั้น ห้ามส่ง Secret, access token หรือ Authorization header เข้าแชต

ตั้ง `IMAGE_ALLOWED_HOSTS` เป็น hostname ของภาพที่ตรวจสอบแล้วจาก API response โดยใส่ชื่อเต็ม ไม่มี `https://` ไม่มี wildcard และคั่นหลาย host ด้วยจุลภาค ไม่มีการอนุญาต host อัตโนมัติ

```bash
python collector/fetch_products.py
python scripts/download_images.py
python scripts/download_images.py --retry-failed
```

คำสั่งดาวน์โหลดจะใช้ข้อมูลจาก SQLite เท่านั้น ไม่เรียก Shopee เพิ่ม ไม่เรนเดอร์ และไม่โพสต์

## การต่อข้อมูลหลายภาพ

- `SHOPEE_IMAGE_PATHS=imageUrl` คือค่าเริ่มต้น
- หาก response จริงมีรายการภาพเพิ่ม ให้ระบุ dotted JSON paths คั่นด้วยจุลภาค ฟังก์ชันรองรับทั้ง list ของ URL และ list ของ object ที่มี URL
- `SHOPEE_PRODUCTS_QUERY_FILE` คือไฟล์ GraphQL ที่คุณตรวจสอบกับ schema และสิทธิ์บัญชีแล้ว ต้องยังคืน `productOfferV2.nodes`, `pageInfo` และฟิลด์เดิม พร้อมรับตัวแปร `page`, `limit`
- ไม่ควรกรอกชื่อฟิลด์จากการคาดเดา ตัวอย่าง `fixtureGallery.url` ในชุดทดสอบเป็นข้อมูลจำลอง ไม่ใช่ฟิลด์ Shopee
- หากเพิ่มฟิลด์ให้สินค้าที่เก็บแล้ว ให้เก็บข้อมูลใหม่หลังพ้นช่วง dedupe หรือใช้ `python -c "from collector.fetch_products import run; print(run(dedupe_days=0))"` เพื่อข้าม dedupe ในรอบนั้น อย่าลบฐานข้อมูลเพื่อแก้ปัญหานี้

## พฤติกรรมโมดูลภาพ

- เก็บมากสุด 6 ภาพไม่ซ้ำต่อสินค้า ตั้งได้ด้วย `IMAGE_MAX_PER_PRODUCT` สูงสุด 20; ลอง candidate สูงสุด 3 เท่าของจำนวนภาพ
- รับ HTTPS บน port 443 จาก exact-host allowlist เท่านั้น ไม่ตาม redirect และตรวจ DNS ว่าไม่ชี้ private network
- จำกัดไฟล์ 10 MiB, 20 ล้านพิกเซล และด้านสั้นอย่างน้อย 500 px; ตรวจไฟล์จริงด้วย Pillow
- รองรับ JPEG/PNG/WebP ปรับ EXIF orientation และบันทึก RGB JPEG บนพื้นขาว โดยไม่ครอปในขั้นดาวน์โหลด
- กันซ้ำทั้ง URL และ hash ของพิกเซลที่ decode แล้ว ไม่ใช่ระบบตรวจภาพคล้ายหรือ placeholder ด้วย AI
- ลองใหม่เฉพาะ timeout/connection error และ HTTP 429/500/502/503/504 สูงสุด 3 ครั้ง; ถ้ารอ rate limit นานกว่า 30 วินาที ให้จบ batch และลองใหม่ภายหลัง
- เก็บภาพและ `manifest.json` ใน `assets/products/<item_id>_<shop_id>/` พร้อมที่มา ขนาด และเหตุผลที่ภาพใช้ไม่ได้
- ภาพใช้ไม่ได้บางใบ: ใช้ใบที่ผ่านต่อได้; ไม่มีภาพผ่าน: สถานะ `image_failed` ไม่ส่งเรนเดอร์
- 3 ภาพขึ้นไป: ใช้ 3 ใบแรกใน hook/spec/cta; 2 ภาพ: วน 1,2,1; 1 ภาพ: ใช้ภาพเดิมทั้ง 3 ช่วง ไม่แต่งภาพสินค้าเพิ่ม
- รอบใหม่จะดาวน์โหลด URL อีกครั้ง เพื่อไม่ถือว่าไฟล์เก่ายังเป็นข้อมูลปัจจุบัน ไม่มี TTL cache ในเวอร์ชันนี้

Manifest มี URL ต้นทางซึ่งอาจมี query string ที่อ่อนไหว จึงควรเก็บเป็นไฟล์ส่วนตัวและไม่ commit โฟลเดอร์ภาพ การตรวจ DNS ก่อน request ไม่ใช่ egress firewall: production ควรจำกัด outbound network เพิ่มเพื่อป้องกัน DNS rebinding

## เชื่อม MoviePy

```bash
python scripts/run_pipeline.py
```

Pipeline จะตรวจ config → collect → ดาวน์โหลดภาพจริงลงดิสก์ → เลือกภาพแต่ละฉาก → render → QA → สร้างคิว pending โดยยังต้องติดตั้ง ffmpeg และฟอนต์ไทยตามโค้ดเดิมก่อน

แก้ปัญหา `first_seen` หายก่อน INSERT, migrate คอลัมน์ `image_urls` / `local_images` อัตโนมัติ และไม่ reset สถานะ rendered/published เมื่อเก็บข้อมูลซ้ำ

ลบข้อความโปรโมชั่นที่ไม่มีหลักฐานออกจาก template และ pipeline แล้ว แต่ส่วน Publisher/OAuth/Quota ที่สืบทอดมายังเป็น scaffold ที่ต้องตรวจและทดสอบแยกก่อนใช้งานจริง ห้ามตีความค่า quota หรือ signature ในโค้ดเก่าว่าได้รับการยืนยันใหม่ในเวอร์ชันนี้
