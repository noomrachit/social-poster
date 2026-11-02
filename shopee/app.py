"""แดชบอร์ดหน้าเว็บสำหรับใช้งาน shopee-auto ง่ายๆ ผ่านเบราว์เซอร์

รันด้วย:
    python app.py
แล้วเปิด http://127.0.0.1:5000

หน้าเว็บนี้แค่ "ครอบ" สคริปต์เดิม (collector/renderer/publisher) ให้กดปุ่มได้
ไม่ได้เปลี่ยน logic การทำงานใดๆ ของไปป์ไลน์เดิม
"""
from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

from flask import Flask, Response, redirect, render_template_string, request, send_file, url_for

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config.config import load  # noqa: E402
from core.db import DB  # noqa: E402

app = Flask(__name__)

# ป้องกันคนแปลกหน้าเข้าแดชบอร์ด (จำเป็นเมื่อ deploy ขึ้นอินเทอร์เน็ตจริง เช่น Railway)
# ตั้งค่า APP_USERNAME / APP_PASSWORD ใน environment variable — ถ้าไม่ตั้ง จะไม่ล็อก
# (เหมาะสำหรับรันในเครื่องตัวเองผ่าน 127.0.0.1 เท่านั้น)
_APP_USER = os.getenv("APP_USERNAME", "")
_APP_PASS = os.getenv("APP_PASSWORD", "")


@app.before_request
def _require_login():
    if not _APP_PASS:
        return None  # ไม่ได้ตั้งรหัสผ่าน = โหมดรันในเครื่องตัวเอง ไม่ล็อก
    auth = request.authorization
    if not auth or auth.username != _APP_USER or auth.password != _APP_PASS:
        return Response(
            "ต้องใส่ชื่อผู้ใช้/รหัสผ่านก่อนเข้าแดชบอร์ด",
            401,
            {"WWW-Authenticate": 'Basic realm="Shopee Auto"'},
        )
    return None

BASE = """
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shopee Auto - แดชบอร์ด</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: "Sarabun","Segoe UI",Tahoma,sans-serif; background:#f5f6f8; margin:0; color:#1f2430; }
  header { background:#ee4d2d; color:white; padding:16px 24px; }
  header h1 { margin:0; font-size:20px; }
  nav { display:flex; gap:4px; background:#fff; padding:0 16px; border-bottom:1px solid #e5e5e5; overflow-x:auto; }
  nav a { padding:12px 14px; text-decoration:none; color:#555; font-size:14px; white-space:nowrap; border-bottom:3px solid transparent; }
  nav a.active { color:#ee4d2d; border-bottom-color:#ee4d2d; font-weight:600; }
  main { max-width:960px; margin:20px auto; padding:0 16px 60px; }
  .card { background:#fff; border-radius:10px; padding:20px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
  .stat { text-align:center; padding:14px; border-radius:8px; background:#fafafa; }
  .stat b { display:block; font-size:26px; color:#ee4d2d; }
  .stat span { font-size:12px; color:#777; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #eee; }
  .btn { display:inline-block; background:#ee4d2d; color:#fff; border:none; padding:10px 16px;
         border-radius:6px; font-size:14px; cursor:pointer; text-decoration:none; }
  .btn.secondary { background:#555; }
  .btn.small { padding:6px 10px; font-size:12px; }
  form.inline { display:inline; }
  .msg { padding:12px 14px; border-radius:8px; margin-bottom:16px; font-size:14px; white-space:pre-wrap; }
  .msg.ok { background:#e7f7ee; color:#137a3d; }
  .msg.err { background:#fdecea; color:#a83127; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; }
  .badge.ready { background:#e7f7ee; color:#137a3d; }
  .badge.new { background:#eef2fb; color:#3355aa; }
  .badge.rendered { background:#fff4e0; color:#a56b00; }
  .badge.image_failed, .badge.rejected { background:#fdecea; color:#a83127; }
  .badge.pending { background:#eef2fb; color:#3355aa; }
  .badge.approved { background:#fff4e0; color:#a56b00; }
  .badge.published { background:#e7f7ee; color:#137a3d; }
  .badge.failed { background:#fdecea; color:#a83127; }
  code { background:#f0f0f0; padding:1px 6px; border-radius:4px; }
  .help { color:#777; font-size:13px; margin-top:6px; }
  video { max-width:260px; border-radius:8px; display:block; margin-top:6px; }
</style>
</head>
<body>
<header><h1>🛒 Shopee Auto — แดชบอร์ด</h1></header>
<nav>
  <a href="{{ url_for('home') }}" class="{{ 'active' if active=='home' else '' }}">หน้าหลัก</a>
  <a href="{{ url_for('products') }}" class="{{ 'active' if active=='products' else '' }}">สินค้า</a>
  <a href="{{ url_for('approvals') }}" class="{{ 'active' if active=='approvals' else '' }}">รออนุมัติ</a>
  <a href="{{ url_for('settings') }}" class="{{ 'active' if active=='settings' else '' }}">ตั้งค่า</a>
</nav>
<main>
{% if message %}<div class="msg {{ 'err' if is_error else 'ok' }}">{{ message }}</div>{% endif %}
{{ body|safe }}
</main>
</body>
</html>
"""


def render(body_html: str, active: str, message: str | None = None, is_error: bool = False):
    return render_template_string(BASE, body=body_html, active=active,
                                   message=message, is_error=is_error)


def _run_step(fn, *a, **kw):
    """เรียกฟังก์ชันของไปป์ไลน์เดิม แล้วคืน (ok, text) แบบอ่านง่าย ไม่ทำให้แอปล่ม"""
    try:
        result = fn(*a, **kw)
        return True, f"สำเร็จ: {result}"
    except Exception as exc:  # noqa: BLE001
        return False, f"ผิดพลาด: {exc}"


@app.route("/")
def home():
    cfg = load()
    db = DB(cfg.app.db_path)
    counts = {}
    for status in ("new", "ready", "image_failed", "rendered", "rejected"):
        counts[status] = len(db.list_products(status))
    pub_counts = {}
    for status in ("pending", "approved", "published", "failed"):
        pub_counts[status] = len(db.list_publishes(status))
    db.close()

    stats_html = "".join(
        f'<div class="stat"><b>{v}</b><span>สินค้า: {k}</span></div>'
        for k, v in counts.items()
    )
    pub_stats_html = "".join(
        f'<div class="stat"><b>{v}</b><span>โพสต์: {k}</span></div>'
        for k, v in pub_counts.items()
    )

    body = f"""
    <div class="card">
      <h3>ภาพรวมสินค้า</h3>
      <div class="grid">{stats_html}</div>
    </div>
    <div class="card">
      <h3>ภาพรวมคิวโพสต์</h3>
      <div class="grid">{pub_stats_html}</div>
    </div>
    <div class="card">
      <h3>ทำตามลำดับ 3 ขั้นตอน</h3>
      <p>1) ดึงสินค้าจาก Shopee → 2) ดาวน์โหลดภาพ + ตัดวิดีโอ (render) → 3) ตรวจและกด "อนุมัติ" ก่อนโพสต์จริง</p>
      <form method="post" action="{url_for('run_fetch')}" style="margin-bottom:10px">
        <button class="btn" type="submit">① ดึงสินค้าจาก Shopee</button>
      </form>
      <form method="post" action="{url_for('run_pipeline_route')}" style="margin-bottom:10px">
        <button class="btn" type="submit">② ดาวน์โหลดภาพ + ตัดวิดีโอ</button>
      </form>
      <a class="btn secondary" href="{url_for('approvals')}">③ ไปหน้าตรวจ/อนุมัติ</a>
      <p class="help">ทุกปุ่มเรียกสคริปต์เดิมในโปรเจกต์ตรงๆ (collector / renderer) ไม่มีการเปลี่ยน logic</p>
    </div>
    """
    msg, err = _flash_from_request()
    return render(body, "home", msg, err)


@app.route("/fetch", methods=["POST"])
def run_fetch():
    from collector.fetch_products import run as collect
    ok, text = _run_step(collect)
    return _flash_redirect("home", ok, text)


@app.route("/pipeline", methods=["POST"])
def run_pipeline_route():
    from scripts.run_pipeline import run as pipeline
    ok, text = _run_step(pipeline)
    return _flash_redirect("home", ok, text)


# เก็บข้อความแจ้งเตือนแบบง่ายๆ ไว้ใน query string (ไม่ต้องใช้ session/cookie)
from urllib.parse import quote, unquote  # noqa: E402


def _flash_redirect(endpoint: str, ok: bool, text: str):
    return redirect(url_for(endpoint) + f"?msg={quote(text)}&err={0 if ok else 1}")


@app.before_request
def _inject_flash():
    pass


def _flash_from_request():
    msg = request.args.get("msg")
    err = request.args.get("err") == "1"
    return (unquote(msg) if msg else None), err


@app.route("/products")
def products():
    cfg = load()
    db = DB(cfg.app.db_path)
    rows = []
    for status in ("new", "ready", "rendered", "image_failed", "rejected"):
        rows.extend(dict(r) for r in db.list_products(status))
    db.close()

    def video_cell(item_id, shop_id):
        key = f"{item_id}_{shop_id}"
        path = Path("out") / f"{key}.mp4"
        if path.exists():
            return f'<video controls src="{url_for("video", key=key)}"></video>'
        return "-"

    trs = "".join(
        f"""<tr>
          <td>{r['name'] or '-'}</td>
          <td>{r['price'] or '-'}</td>
          <td><span class="badge {r['status']}">{r['status']}</span></td>
          <td>{video_cell(r['item_id'], r['shop_id'])}</td>
        </tr>"""
        for r in rows
    ) or '<tr><td colspan="4">ยังไม่มีสินค้า — ไปหน้าหลักแล้วกด "ดึงสินค้าจาก Shopee" ก่อน</td></tr>'

    msg, err = _flash_from_request()
    body = f"""
    <div class="card">
      <h3>รายการสินค้า</h3>
      <table>
        <tr><th>ชื่อสินค้า</th><th>ราคา</th><th>สถานะ</th><th>วิดีโอ</th></tr>
        {trs}
      </table>
    </div>
    """
    return render(body, "products", msg, err)


@app.route("/video/<key>")
def video(key: str):
    path = (Path("out") / f"{key}.mp4").resolve()
    if not str(path).startswith(str(Path("out").resolve())) or not path.exists():
        return "ไม่พบไฟล์", 404
    return send_file(path, mimetype="video/mp4")


@app.route("/approvals")
def approvals():
    cfg = load()
    db = DB(cfg.app.db_path)
    pending = [dict(r) for r in db.list_publishes("pending")]
    approved = [dict(r) for r in db.list_publishes("approved")]
    db.close()

    def row(r, action_html):
        return f"""<tr>
          <td>{r['id']}</td><td>{r['platform']}</td><td>{r['product_key']}</td>
          <td><span class="badge {r['status']}">{r['status']}</span></td>
          <td>{action_html}</td>
        </tr>"""

    pending_rows = "".join(
        row(r, f'''<form class="inline" method="post" action="{url_for('approve', publish_id=r['id'])}">
                     <button class="btn small" type="submit">อนุมัติ</button>
                   </form>''')
        for r in pending
    ) or '<tr><td colspan="5">ไม่มีรายการรออนุมัติ</td></tr>'

    approved_rows = "".join(row(r, "-") for r in approved) or \
        '<tr><td colspan="5">ยังไม่มีรายการที่อนุมัติแล้ว</td></tr>'

    msg, err = _flash_from_request()
    body = f"""
    <div class="card">
      <h3>รอตรวจสอบ (pending) — ดูวิดีโอในหน้า "สินค้า" ก่อนกดอนุมัติ</h3>
      <table>
        <tr><th>ID</th><th>แพลตฟอร์ม</th><th>สินค้า</th><th>สถานะ</th><th></th></tr>
        {pending_rows}
      </table>
    </div>
    <div class="card">
      <h3>อนุมัติแล้ว — พร้อมโพสต์จริง</h3>
      <table>
        <tr><th>ID</th><th>แพลตฟอร์ม</th><th>สินค้า</th><th>สถานะ</th><th></th></tr>
        {approved_rows}
      </table>
      <form method="post" action="{url_for('publish')}" style="margin-top:12px">
        <button class="btn" type="submit" onclick="return confirm('จะโพสต์ขึ้น TikTok/YouTube จริง ต้องตั้งค่า API ให้ครบก่อน ยืนยันหรือไม่?')">
          📤 โพสต์รายการที่อนุมัติแล้วทั้งหมด
        </button>
      </form>
      <p class="help">ปุ่มนี้เรียก scripts/publish_approved.py ซึ่งต้องกรอก TikTok/YouTube credential ใน .env ก่อน</p>
    </div>
    """
    return render(body, "approvals", msg, err)


@app.route("/approve/<int:publish_id>", methods=["POST"])
def approve(publish_id: int):
    cfg = load()
    db = DB(cfg.app.db_path)
    db.set_publish_status(publish_id, "approved")
    db.close()
    return _flash_redirect("approvals", True, f"อนุมัติรายการ #{publish_id} แล้ว")


@app.route("/publish", methods=["POST"])
def publish():
    from scripts.publish_approved import run as publish_run
    ok, text = _run_step(publish_run)
    return _flash_redirect("approvals", ok, text)


@app.route("/settings")
def settings():
    cfg = load()
    required = [
        ("SHOPEE_APP_ID", cfg.shopee.app_id),
        ("SHOPEE_APP_SECRET", cfg.shopee.app_secret),
        ("IMAGE_ALLOWED_HOSTS", os.getenv("IMAGE_ALLOWED_HOSTS", "")),
        ("TIKTOK_ACCESS_TOKEN", cfg.tiktok.access_token),
        ("GOOGLE_REFRESH_TOKEN", cfg.google.refresh_token),
    ]
    fonts_ok = Path("assets/fonts/NotoSansThai-Regular.ttf").exists() and \
        Path("assets/fonts/NotoSansThai-Bold.ttf").exists()
    import shutil
    ffmpeg_ok = shutil.which("ffmpeg") is not None

    def check(ok):
        return "✅" if ok else "❌"

    rows = "".join(
        f"<tr><td><code>{name}</code></td><td>{check(bool(val))}</td></tr>"
        for name, val in required
    )

    body = f"""
    <div class="card">
      <h3>สถานะการตั้งค่า</h3>
      <table>
        <tr><th>ค่าที่ต้องตั้ง</th><th>กรอกแล้วหรือยัง</th></tr>
        {rows}
        <tr><td>ฟอนต์ไทย (assets/fonts/)</td><td>{check(fonts_ok)}</td></tr>
        <tr><td>ffmpeg ติดตั้งในเครื่อง</td><td>{check(ffmpeg_ok)}</td></tr>
      </table>
      <p class="help">
        แก้ไขค่าต่างๆ ได้ในไฟล์ <code>.env</code> ที่โฟลเดอร์โปรเจกต์ (คัดลอกจาก <code>.env.example</code>)<br>
        ห้ามแชร์ไฟล์ <code>.env</code> ให้ใครหรือส่งเข้าแชต เพราะมี secret อยู่ข้างใน
      </p>
    </div>
    """
    return render(body, "settings")


if __name__ == "__main__":
    # PORT มาจาก Railway (หรือ hosting อื่น) อัตโนมัติ; รันในเครื่องตัวเองจะใช้ 5000
    port = int(os.getenv("PORT", "5000"))
    # host 0.0.0.0 จำเป็นเมื่อรันบน Railway (ต้องรับ request จากภายนอก container)
    # รันในเครื่องตัวเองก็ยังเข้าผ่าน http://127.0.0.1:5000 ได้ตามปกติ
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
    print(f"เปิดเบราว์เซอร์ไปที่ http://127.0.0.1:{port}" if host == "127.0.0.1"
          else f"กำลังรันที่พอร์ต {port}")
    app.run(host=host, port=port, debug=False)
