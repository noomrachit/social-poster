# เชื่อม Claude กับ social-poster ผ่าน MCP

Endpoint: `POST https://<โดเมนแอป>/mcp` (Streamable HTTP, stateless)

เครื่องมือ: `list_integrations`, `create_post` (โพสต์จริงทันที), `create_draft` (ร่าง/ตั้งเวลา), `publish_post` (โพสต์ร่างที่อนุมัติแล้ว), `import_yingad` (ดึงชุดของวันจากยิงแอดเป็นร่าง), `list_posts`, `get_analytics`

แนะนำให้ผู้ช่วย AI ใช้ `create_draft` / `import_yingad` แล้วรอผู้ใช้อนุมัติก่อน `publish_post`

## Claude Code
```bash
claude mcp add --transport http social-poster https://<โดเมนแอป>/mcp \
  --header "Authorization: Bearer $ADMIN_TOKEN"
```

## claude.ai (Custom connector — ใส่ header ไม่ได้)
1. บน Railway ตั้ง `MCP_PATH_SECRET` เป็นรหัสสุ่มยาว ≥ 32 ตัว (คนละค่ากับ `ADMIN_TOKEN`)
2. เพิ่ม connector ด้วย URL `https://<โดเมนแอป>/mcp/<MCP_PATH_SECRET>`
3. URL นี้คือรหัสผ่าน ห้ามแชร์ ถ้าหลุดให้เปลี่ยนค่า `MCP_PATH_SECRET`

ไม่ตั้ง `MCP_PATH_SECRET` = เส้นทางนี้ปิด
