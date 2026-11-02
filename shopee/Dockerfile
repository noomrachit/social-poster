FROM python:3.12-slim

# ffmpeg จำเป็นสำหรับ MoviePy
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ฟอนต์ไทยมากับโปรเจกต์แล้วใน assets/fonts/

# รันแดชบอร์ดเว็บ (app.py) ผ่าน gunicorn สำหรับ production
# --timeout ยาวเพราะขั้นตอน render วิดีโอใช้เวลาหลายสิบวินาทีถึงไม่กี่นาที
# ${PORT} มาจาก Railway อัตโนมัติ (ใช้ sh -c เพื่อให้ env var ถูกแทนค่า)
CMD ["sh", "-c", "gunicorn -w 1 -k gthread --threads 4 --timeout 600 -b 0.0.0.0:${PORT:-5000} app:app"]