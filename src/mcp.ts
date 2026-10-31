// MCP server — ให้ Claude สั่งงาน social-poster ผ่าน Streamable HTTP (stateless)
//   เส้นทาง: POST /mcp  (ต้องส่ง Authorization: Bearer <ADMIN_TOKEN> หรือ x-admin-token)
//   ตัวเลือก: ตั้ง MCP_PATH_SECRET (ยาว ≥ 32 ตัว) เพื่อเปิด POST /mcp/<secret> สำหรับ client ที่ใส่ header ไม่ได้ (เช่น claude.ai)
import { timingSafeEqual } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as makeRouter } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createPost, getAnalytics, listIntegrations, listPosts } from "./lib/services.js";
import { PRIVACY_STATUSES } from "./providers/types.js";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthorized(headers: Request["headers"], pathSecret?: string): boolean {
  const admin = process.env.ADMIN_TOKEN;
  const configuredSecret = process.env.MCP_PATH_SECRET;
  if (pathSecret !== undefined) {
    return !!configuredSecret && configuredSecret.length >= 32 && safeEqual(pathSecret, configuredSecret);
  }
  if (!admin) return false;
  const bearer = String(headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const header = String(headers["x-admin-token"] ?? "");
  return (bearer !== "" && safeEqual(bearer, admin)) || (header !== "" && safeEqual(header, admin));
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "social-poster", version: "0.1.0" });

  server.registerTool(
    "list_integrations",
    {
      title: "ดูบัญชีที่เชื่อมไว้",
      description: "แสดงบัญชีโซเชียลที่เชื่อมไว้ (id, platform, ชื่อ) ใช้ id นี้ระบุปลายทางตอนโพสต์",
      annotations: { readOnlyHint: true },
    },
    async () => json(await listIntegrations())
  );

  server.registerTool(
    "create_post",
    {
      title: "โพสต์",
      description:
        "โพสต์จริงไปยังบัญชีที่เชื่อมไว้ (ย้อนกลับไม่ได้) เรียกเฉพาะเมื่อผู้ใช้สั่งโพสต์ชัดเจนและยืนยันเนื้อหาแล้ว " +
        "YouTube รับเฉพาะวิดีโอ: ต้องมี mediaUrls[0] เป็นลิงก์วิดีโอ บรรทัดแรกของ content คือชื่อคลิป",
      inputSchema: {
        content: z.string().min(1).describe("ข้อความโพสต์"),
        mediaUrls: z.array(z.string().url()).optional().describe("ลิงก์ไฟล์ (วิดีโอ/รูป)"),
        integrationIds: z.array(z.string()).optional().describe("id บัญชีปลายทาง (ไม่ใส่ = ทุกบัญชี)"),
        privacyStatus: z
          .enum(PRIVACY_STATUSES)
          .optional()
          .describe("ความเป็นส่วนตัวของวิดีโอ YouTube: private (ค่าเริ่มต้น) | unlisted | public"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ content, mediaUrls, integrationIds, privacyStatus }) => {
      const out = await createPost(content, mediaUrls ?? [], integrationIds, privacyStatus);
      return out ? json(out) : failure("ไม่มีบัญชีที่เชื่อมไว้ตรงกับที่ขอ (ลอง list_integrations)");
    }
  );

  server.registerTool(
    "list_posts",
    {
      title: "ประวัติโพสต์",
      description: "ประวัติโพสต์ล่าสุด พร้อมผลแยกรายแพลตฟอร์ม",
      inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("จำนวนสูงสุด (ค่าเริ่มต้น 10)") },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => json(await listPosts(limit ?? 10))
  );

  server.registerTool(
    "get_analytics",
    {
      title: "สถิติโพสต์",
      description: "สถิติ (views/likes/comments) ของโพสต์ที่ส่งสำเร็จ ดึงสดจากแพลตฟอร์ม ปัจจุบันรองรับ YouTube",
      inputSchema: { postId: z.string().optional().describe("id โพสต์ (ไม่ใส่ = 20 โพสต์ล่าสุด)") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ postId }) => json(await getAnalytics(postId ?? null))
  );

  return server;
}

async function handle(req: Request, res: Response, pathSecret?: string) {
  if (!isAuthorized(req.headers, pathSecret)) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" }, id: null });
    return;
  }
  // stateless: สร้าง server + transport ใหม่ทุกคำขอ ไม่เก็บ session ใน memory
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
}

const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless)" }, id: null });

export const mcpRouter: Router = makeRouter();
mcpRouter.post("/mcp", (req, res) => void handle(req, res));
mcpRouter.post("/mcp/:secret", (req, res) => void handle(req, res, req.params.secret));
mcpRouter.get(["/mcp", "/mcp/:secret"], methodNotAllowed);
mcpRouter.delete(["/mcp", "/mcp/:secret"], methodNotAllowed);
