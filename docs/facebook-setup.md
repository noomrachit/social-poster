# ตั้งค่า Facebook (เพจ) — Development mode

ถ้าคุณเป็นแอดมินทั้งของ Meta App และของเพจ แอปจะโพสต์ลงเพจได้ทันทีโดยไม่ต้องผ่าน App Review

1. เข้า https://developers.facebook.com/apps → **Create App** → เลือก use case "Other" → ประเภท **Business** → ตั้งชื่อแล้วสร้าง
2. ในแอป ไปที่ **Add product** → **Facebook Login for Business** (หรือ Facebook Login) → Set up
3. Facebook Login → **Settings** → ช่อง **Valid OAuth Redirect URIs** ใส่
   `https://app-production-a4bb.up.railway.app/auth/facebook/callback` แล้ว Save
4. **App settings → Basic**: คัดลอก **App ID** และ **App Secret** (กด Show) ใส่ App domain เป็น `app-production-a4bb.up.railway.app` และใส่ Privacy Policy URL (ลิงก์อะไรก็ได้ของคุณ)
5. ปล่อยแอปไว้โหมด **Development** ได้เลย (บัญชีของคุณต้องเป็น Admin ใน App roles)
6. Railway → service app → **Variables** เพิ่ม `FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI` (ค่าข้างบน) → รอ deploy
7. เปิด `https://app-production-a4bb.up.railway.app/auth/facebook/start?token=<ADMIN_TOKEN>` (หรือกด "+ เชื่อม Facebook" ในหน้าเว็บ) → ล็อกอิน → **ติ๊กเลือกเพจ** และอนุญาตทุกสิทธิ์
8. เสร็จแล้วเพจจะขึ้นใน `/integrations` เป็น platform `facebook`

สิทธิ์ที่ขอ: pages_show_list, pages_manage_posts, pages_read_engagement

การโพสต์: ใช้ Reels (`/{page-id}/video_reels`, วิดีโอแนวตั้ง 9:16 ยาว 3–90 วินาที) ถ้าไม่ผ่านจะโพสต์เป็นวิดีโอปกติ (`/{page-id}/videos`) อัตโนมัติ ไฟล์ใน mediaUrls ต้องเป็นลิงก์ public
