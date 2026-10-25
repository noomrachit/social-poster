import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: เข้ารหัส access/refresh token ก่อนเก็บลง Postgres
// TOKEN_ENCRYPTION_KEY ต้องเป็น hex 32 bytes (64 ตัวอักษร) — ตั้งผ่าน ENV ของ Railway เท่านั้น
// สร้างคีย์ใหม่ด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars)");
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // เก็บเป็น iv:authTag:ciphertext (base64) ในฟิลด์เดียว
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
