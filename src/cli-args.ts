// แยก parser ออกจาก cli.ts เพื่อเทสต์ได้โดยไม่ต้องยิง HTTP จริง

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string[]>;
}

/** --key value (ซ้ำได้หลายครั้ง) / --key=value / --flag (ไม่มีค่า = "true") */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    let key: string;
    let value: string;
    if (eq > -1) {
      key = a.slice(2, eq);
      value = a.slice(eq + 1);
    } else {
      key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i++;
      } else value = "true";
    }
    (flags[key] ??= []).push(value);
  }
  return { command, positional, flags };
}

export function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

export function splitList(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

export const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function mimeFor(path: string): string | null {
  const m = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return (m && MIME_BY_EXT[m[0]]) || null;
}
