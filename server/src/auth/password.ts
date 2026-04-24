import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;
const B64 = (b: Buffer) => b.toString("base64");

/** 存库格式: salt:hash 均为 base64 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const h = (await scryptAsync(plain, salt, SCRYPT_KEYLEN) as Buffer);
  return `${B64(salt)}:${B64(h)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltB64, hashB64] = parts;
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const want = Buffer.from(hashB64, "base64");
  if (salt.length < 8 || want.length < 8) return false;
  const out = (await scryptAsync(plain, salt, want.length) as Buffer);
  return timingSafeEqual(out, want);
}
