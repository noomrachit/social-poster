# ยิงแอด (ย้ายมาจาก noomrachit/yingad-links)

โปรเจกต์ขายของผ่านลิงก์นายหน้า Shopee ของช่อง @pora7307 · เป้ารายได้ก้อนแรก 10,000 บาท

## อะไรอยู่ตรงไหน

| ส่วน | ที่อยู่ใหม่ | หมายเหตุ |
|---|---|---|
| หน้ารวมลิงก์ | `public/yingad/index.html` → `/yingad/` | |
| เครื่องมือแคปชัน/คลิป | `public/yingad/studio/` → `/yingad/studio/` | อ่าน `/yingad/products.json` |
| แนวทางช่อง | `yingad/guide.md` | |
| ตัวทำชุดรายวัน | `yingad/tools/daily_pack.py` | Python + Pillow + ffmpeg |
| ร่างโพสต์จากชุดของวัน | `src/lib/yingad.ts` + `POST /posts/import/yingad` | |

## ยังอยู่ที่ yingad-links (ห้ามลบ)

- `daily-pick/`, `media/` — งานเช้าของเดชาส่งขึ้นที่นั่น และมานะ (Grok) อ่านจากลิงก์ raw / GitHub Pages
- `to-team.md`, `claude-to-grok.md`, `grok-to-claude.md`, `admin-alerts.md` — ไฟล์สื่อสารของทีม
- หน้ารวมลิงก์เดิม — ลิงก์ในไบโอ TikTok/YouTube ชี้ไปที่ `noomrachit.github.io/yingad-links/`

ถ้าจะย้ายส่วนนี้ ต้องเปลี่ยนงานเช้าของเดชา คำสั่งของมานะ และลิงก์ในไบโอพร้อมกัน
