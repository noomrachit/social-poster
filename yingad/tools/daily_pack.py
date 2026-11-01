"""สร้างชุดคอนเทนต์ประจำวัน: คลิปแนวตั้ง 15 วินาที + แคปชัน 4 แพลตฟอร์ม

ใช้: python3 tools/daily_pack.py [วันที่ YYYY-MM-DD] [--input สินค้า.json]
--input คือรายการสินค้าจาก Notion (ชื่อสินค้า, ลิงก์, โค้ด, จุดเด่น, ขายได้, สถานะ, ทำล่าสุด, มุมล่าสุด)
ไม่ใส่ --input จะใช้ products.json
เลือกสินค้า: ตัวที่ขายได้ถูกเลือกถี่ขึ้น ไม่ซ้ำสองวันติด  เลือกมุม: เปลี่ยนทุกวัน ไม่ซ้ำมุมล่าสุดของสินค้านั้น
ผลลัพธ์อยู่ในโฟลเดอร์ out/
"""
import json, math, os, re, subprocess, sys, datetime
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out")
W, H, FPS, DUR = 1080, 1920, 30, 15
DISC = "ลิงก์แนะนำ ช่องได้ค่าคอมมิชชันโดยคุณไม่เสียเงินเพิ่ม"
FONT_CANDIDATES = {
    "bold": ["/usr/share/fonts/opentype/tlwg/Loma-Bold.otf", "/usr/share/fonts/truetype/tlwg/Loma-Bold.ttf"],
    "reg": ["/usr/share/fonts/opentype/tlwg/Loma.otf", "/usr/share/fonts/truetype/tlwg/Loma.ttf"],
}
BG1, BG2 = (15, 18, 34), (30, 36, 70)
FG, MUTED, ACC, WARM, INK, CARD = (236, 238, 248), (154, 161, 192), (140, 155, 255), (240, 160, 75), (26, 18, 6), (36, 42, 80)


def font_path(kind):
    for p in FONT_CANDIDATES[kind]:
        if os.path.exists(p):
            return p
    sys.exit("ไม่พบฟอนต์ไทย ให้ติดตั้งแพ็กเกจ fonts-tlwg-loma ก่อน")


_cache = {}
def font(kind, size):
    k = (kind, size)
    if k not in _cache:
        _cache[k] = ImageFont.truetype(font_path(kind), size, layout_engine=ImageFont.Layout.RAQM)
    return _cache[k]


def ease(t):
    t = min(max(t, 0), 1)
    return 1 - (1 - t) ** 3


def background():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3)))
    return im


BASE = background()


def words(s):
    try:
        from pythainlp.tokenize import word_tokenize
        return word_tokenize(s, keep_whitespace=True)
    except Exception:
        out, buf = [], ""
        for ch in s:
            buf += ch
            if ch == " ":
                out.append(buf); buf = ""
        if buf:
            out.append(buf)
        return out


def wrap(d, s, f, max_w):
    lines, line = [], ""
    for w in words(s):
        t = line + w
        if d.textlength(t, font=f) > max_w and line.strip():
            lines.append(line.strip()); line = w.lstrip()
        else:
            line = t
    if line.strip():
        lines.append(line.strip())
    # คำยาวเกินบรรทัด ตัดทีละตัวอักษร
    fixed = []
    for l in lines:
        while d.textlength(l, font=f) > max_w and len(l) > 1:
            cut = len(l)
            while cut > 1 and d.textlength(l[:cut], font=f) > max_w:
                cut -= 1
            fixed.append(l[:cut]); l = l[cut:]
        fixed.append(l)
    return fixed


def mix(c, a, y=960):
    b = BASE.getpixel((W // 2, min(max(int(y), 0), H - 1)))
    return tuple(int(b[i] * (1 - a) + c[i] * a) for i in range(3))


def text(d, s, y, size, color, a=1.0, kind="bold", max_w=900, lh=1.35):
    if a <= 0 or not s:
        return y
    f = font(kind, size)
    lines = wrap(d, s, f, max_w)
    for i, l in enumerate(lines):
        w = d.textlength(l, font=f)
        d.text(((W - w) / 2, y + i * size * lh), l, font=f, fill=mix(color, a, y))
    return y + len(lines) * size * lh


def render_frame(p, hook, handle, t):
    im = BASE.copy()
    d = ImageDraw.Draw(im)
    if t < 3.5:
        a = ease(t / 0.6)
        text(d, hook, 700 + (1 - a) * 60, 112, FG, a)
        text(d, p["name"], 1180, 64, WARM, ease((t - 0.9) / 0.6), "reg")
    elif t < 10:
        s = t - 3.5
        y = text(d, p["name"], 520, 96, WARM, ease(s / 0.5)) + 40
        f = font("bold", 66)
        for i, b in enumerate(p["benefits"][:3]):
            a = ease((s - 0.8 - i * 0.9) / 0.5)
            if a <= 0:
                continue
            lines = wrap(d, b, f, 740)
            bh = len(lines) * 66 * 1.3 + 60
            x0 = 120 + (1 - a) * 60
            d.rounded_rectangle((x0, y, x0 + W - 240, y + bh), radius=32, fill=mix(CARD, a, y))
            d.ellipse((x0 + 54, y + bh / 2 - 16, x0 + 86, y + bh / 2 + 16), fill=mix(ACC, a, y))
            for j, l in enumerate(lines):
                d.text((x0 + 120, y + 30 + j * 66 * 1.3), l, font=f, fill=mix(FG, a, y))
            y += bh + 26
    else:
        s = t - 10
        a, b = ease(s / 0.5), ease((s - 0.6) / 0.5)
        y = text(d, "สนใจกดลิงก์", 560, 110, FG, a)
        y = text(d, "ในโปรไฟล์ได้เลย", y, 110, FG, a) + 80
        pulse = 1 + 0.035 * math.sin(s * 6)
        bw, bh = 860 * pulse, 170 * pulse
        if b > 0:
            d.rounded_rectangle(((W - bw) / 2, y, (W + bw) / 2, y + bh), radius=int(bh / 2), fill=mix(WARM, b, y))
            label = ("โค้ด " + p["code"]) if p.get("code") else ("ติดตาม " + handle)
            f = font("bold", 70)
            w = d.textlength(label, font=f)
            d.text(((W - w) / 2, y + bh / 2 - 46), label, font=f, fill=INK)
        if p.get("code"):
            text(d, "ติดตาม " + handle, y + bh + 70, 56, FG, b, "reg")
        text(d, DISC, 1640, 40, MUTED, b, "reg")
    edge = min(t, DUR - t)
    if edge < 0.25:
        im = Image.blend(Image.new("RGB", (W, H), BG1), im, max(edge, 0) / 0.25)
    return im


def make_video(p, hook, handle, path):
    proc = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
        "-r", str(FPS), "-i", "-", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    for k in range(DUR * FPS):
        proc.stdin.write(render_frame(p, hook, handle, k / FPS).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("สร้างคลิปไม่สำเร็จ")


def tags(p):
    return " ".join("#" + t.replace(" ", "") for t in p["tags"] + ["รีวิว", "ป้ายยา"])


def captions(p, hook, hub):
    b, code = p["benefits"], (f"\nโค้ดสินค้า {p['code']}" if p.get("code") else "")
    return {
        "TikTok": f"{hook}\n{b[0]} · {b[1]}\nลิงก์อยู่ในโปรไฟล์{code}\n\n{tags(p)}\n({DISC})",
        "Facebook / Reels": f"{hook}\n\nใช้{p['name']}มาสักพัก ชอบอยู่ 3 ข้อ\n1. {b[0]}\n2. {b[1]}\n3. {b[2]}\n\nใครสนใจ กดดูได้ที่นี่ {p['link']}{code}\n\n{DISC}",
        "YouTube Shorts": f"ชื่อคลิป: {hook} | {p['name']}\n\nคำอธิบาย:\n{' · '.join(b)}\nลิงก์สินค้าและเครื่องมือทั้งหมด {hub}\n{DISC}\n\n{tags(p)} #shorts",
        "กลุ่ม / ไลน์": f"แชร์ของที่ใช้จริงครับ {p['name']}\n{b[0]} แล้วก็{b[1]}\nใครกำลังหาอยู่ ลองดูตัวนี้ {p['link']}\n\n({DISC})",
    }


ANGLES = [
    ("ใช้จริงทุกวัน", "{name} ที่ผมใช้ทุกวัน"),
    ("3 เหตุผล", "3 เหตุผลที่ควรมี{name}"),
    ("ใครเหมาะ", "ใครควรมี{name}?"),
    ("ของคุ้มงบน้อย", "{name} งบไม่แรง แต่คุ้ม"),
    ("ก่อนและหลัง", "ก่อนมี กับ หลังมี{name}"),
    ("ปัญหาและทางแก้", "ยังไม่มี{name}? ดูนี่ก่อน"),
    ("ไอเดียของขวัญ", "ไอเดียของขวัญ: {name}"),
]
SOLD_ANGLE = ("มีคนซื้อตามแล้ว", "{name} ตัวที่มีคนสั่งตามแล้ว")


def load_items(path):
    if path:
        items = json.load(open(path, encoding="utf-8"))
    else:
        items = json.load(open(os.path.join(ROOT, "products.json"), encoding="utf-8"))["products"]
    out = []
    for i, x in enumerate(items):
        b = x.get("benefits") or [t.strip() for t in str(x.get("จุดเด่น", "")).split("/") if t.strip()]
        while len(b) < 3:
            b.append(["ใช้งานง่าย", "คุ้มราคา", "รีวิวดี"][len(b)])
        name = x.get("name") or x.get("ชื่อสินค้า")
        out.append({
            "id": x.get("id") or x.get("url") or str(i), "name": name,
            "link": x.get("link") or x.get("ลิงก์"), "code": x.get("code") or x.get("โค้ด") or "",
            "benefits": b[:3], "sold": float(x.get("sold") or x.get("ขายได้") or 0),
            "last": x.get("last") or x.get("ทำล่าสุด") or "", "last_angle": x.get("last_angle") or x.get("มุมล่าสุด") or "",
            "active": (x.get("สถานะ") or "ใช้งาน") != "พัก",
            "posts7": int(float(x.get("posts7") or x.get("โพสต์7วัน") or 0)),
            "tags": x.get("tags") or [name.replace(" ", ""), "รีวิวของใช้", "ของมันต้องมี"],
        })
    return [x for x in out if x["active"] and x["link"]]


def pick(items, day):
    """สินค้าที่ขายได้ถูกเลือกถี่ขึ้น และไม่ทำสินค้าเดิมซ้ำสองวันติด"""
    def days_since(x):
        try:
            return (day - datetime.date.fromisoformat(x["last"][:10])).days
        except ValueError:
            return 30
    # พักสินค้าที่โพสต์ตั้งแต่ 4 ครั้งใน 7 วันแต่ยังขายไม่ได้ (ถ้ายังมีตัวอื่นให้เลือก)
    fresh = [x for x in items if not (x["posts7"] >= 4 and x["sold"] <= 0)] or items
    pool = [x for x in fresh if days_since(x) >= 2] or [x for x in fresh if days_since(x) >= 1] or fresh
    # ขายได้ถูกเลือกถี่ขึ้น โพสต์น้อยได้เปรียบ
    return max(pool, key=lambda x: ((1 + 3 * x["sold"]) * min(days_since(x), 7) / (1 + x["posts7"]), -items.index(x)))


def pick_angle(p, day):
    angles = ([SOLD_ANGLE] if p["sold"] > 0 else []) + ANGLES
    start = day.toordinal() % len(angles)
    for k in range(len(angles)):
        a = angles[(start + k) % len(angles)]
        if a[0] != p["last_angle"]:
            return a
    return angles[start]


def main():
    args = sys.argv[1:]
    src = None
    if "--input" in args:
        i = args.index("--input"); src = args[i + 1]; del args[i:i + 2]
    day = datetime.date.fromisoformat(args[0]) if args else datetime.date.today()
    data = json.load(open(os.path.join(ROOT, "products.json"), encoding="utf-8"))
    items = load_items(src)
    if not items:
        sys.exit("ไม่มีสินค้าที่สถานะใช้งาน")
    p = pick(items, day)
    angle, tpl = pick_angle(p, day)
    hook = tpl.format(name=p["name"])
    os.makedirs(OUT, exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|\s]+', "-", p["name"]).strip("-")[:30] or "product"
    stem = f"{day.isoformat()}-{safe}"
    video = os.path.join(OUT, stem + ".mp4")
    make_video(p, hook, data["handle"], video)
    caps = captions(p, hook, data["hub"])
    txt = os.path.join(OUT, stem + "-แคปชัน.txt")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write(f"ชุดคอนเทนต์ {day.isoformat()} · {p['name']} · มุม: {angle}\nลิงก์สินค้า: {p['link']}\n")
        for k, v in caps.items():
            fh.write(f"\n===== {k} =====\n{v}\n")
    print(json.dumps({"id": p["id"], "product": p["name"], "angle": angle, "hook": hook, "sold": p["sold"],
                      "video": video, "captions": txt}, ensure_ascii=False))


if __name__ == "__main__":
    main()
