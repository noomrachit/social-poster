#!/usr/bin/env node
// CLI ของ social-poster — เรียก API ของแอปที่ deploy ไว้
//   SOCIAL_POSTER_URL=https://app-xxx.up.railway.app  SOCIAL_POSTER_TOKEN=<ADMIN_TOKEN>
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { isUrl, mimeFor, parseArgs, splitList } from "./cli-args.js";

const HELP = `social-poster CLI

ตั้งค่า: SOCIAL_POSTER_URL, SOCIAL_POSTER_TOKEN (ค่าเดียวกับ ADMIN_TOKEN บนเซิร์ฟเวอร์)

คำสั่ง:
  integrations                      ดูบัญชีที่เชื่อมไว้
  integrations delete <id>          ยกเลิกการเชื่อมบัญชี
  upload <ไฟล์>                      อัปโหลดไฟล์ (video/image) คืน URL
  post "<ข้อความ>" [--media <url|ไฟล์>]... [--to <id,id>]
                                    โพสต์ (ไฟล์ในเครื่องจะอัปโหลดให้อัตโนมัติ)
  history                           ประวัติโพสต์ล่าสุด
  analytics [<postId>]              สถิติโพสต์ (YouTube: views/likes/comments)`;

const base = (process.env.SOCIAL_POSTER_URL ?? "").replace(/\/$/, "");
const token = process.env.SOCIAL_POSTER_TOKEN ?? "";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function api(path: string, init: RequestInit & { duplex?: "half" } = {}): Promise<any> {
  const res = await fetch(base + path, {
    ...init,
    headers: { "x-admin-token": token, ...(init.headers as Record<string, string>) },
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) fail(`HTTP ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function uploadFile(path: string): Promise<string> {
  const type = mimeFor(path);
  if (!type) fail(`ไม่รู้จักชนิดไฟล์: ${path} (รองรับ mp4/mov/webm/mkv/jpg/png/webp/gif)`);
  const s = await stat(path).catch(() => fail(`ไม่พบไฟล์: ${path}`));
  console.error(`อัปโหลด ${basename(path)} (${(s.size / 1024 / 1024).toFixed(1)} MB)...`);
  const data = await api(`/media?name=${encodeURIComponent(basename(path))}`, {
    method: "POST",
    headers: { "content-type": type, "content-length": String(s.size) },
    body: Readable.toWeb(createReadStream(path)) as unknown as BodyInit,
    duplex: "half",
  });
  return data.url as string;
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help") return console.log(HELP);
  if (!base || !token) fail("ต้องตั้ง SOCIAL_POSTER_URL และ SOCIAL_POSTER_TOKEN ก่อน (ดู: help)");

  switch (command) {
    case "integrations": {
      if (positional[0] === "delete") {
        if (!positional[1]) fail("ใช้: integrations delete <id>");
        return console.log(JSON.stringify(await api(`/integrations/${encodeURIComponent(positional[1])}`, { method: "DELETE" }), null, 2));
      }
      for (const i of await api("/integrations")) console.log(`${i.id}  ${i.platform.padEnd(9)} ${i.display_name}`);
      return;
    }
    case "upload": {
      if (!positional[0]) fail("ใช้: upload <ไฟล์>");
      return console.log(await uploadFile(positional[0]));
    }
    case "post": {
      const content = positional.join(" ").trim();
      if (!content) fail('ใช้: post "<ข้อความ>" [--media <url|ไฟล์>] [--to <id,id>]');
      const mediaUrls: string[] = [];
      for (const m of splitList(flags.media)) mediaUrls.push(isUrl(m) ? m : await uploadFile(m));
      const integrationIds = splitList(flags.to);
      const out = await api("/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, mediaUrls, ...(integrationIds.length ? { integrationIds } : {}) }),
      });
      console.log(`postId: ${out.postId}`);
      for (const r of out.results) console.log(`${r.status === "success" ? "✓" : "✗"} ${r.platform ?? "-"}  ${r.postId ?? r.error ?? ""}`);
      if (out.results.some((r: any) => r.status !== "success")) process.exitCode = 2;
      return;
    }
    case "history": {
      for (const p of await api("/posts")) {
        console.log(`${p.id}  ${p.created_at}  ${String(p.content).split("\n")[0].slice(0, 60)}`);
        for (const r of p.results) console.log(`    ${r.status === "success" ? "✓" : "✗"} ${r.platform} ${r.remote_post_id ?? r.error_message ?? ""}`);
      }
      return;
    }
    case "analytics": {
      const q = positional[0] ? `?postId=${encodeURIComponent(positional[0])}` : "";
      for (const a of await api(`/analytics${q}`)) {
        const st = a.stats ? `views ${a.stats.views ?? "-"} · likes ${a.stats.likes ?? "-"} · comments ${a.stats.comments ?? "-"}` : a.note;
        console.log(`${a.postId}  ${a.platform}  ${a.remotePostId}  ${st}`);
      }
      return;
    }
    default:
      fail(`ไม่รู้จักคำสั่ง "${command}"\n\n${HELP}`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
