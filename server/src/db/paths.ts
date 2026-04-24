import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __d = dirname(fileURLToPath(import.meta.url));
/** 编译在 server/dist/… 时上溯到 server/ */
const serverRoot = join(__d, "../..");

export function getSqlitePath(): string {
  const p = process.env.SQLITE_PATH?.trim();
  if (p) return p;
  return join(serverRoot, "data", "plaza.db");
}

/** 广场图片存盘目录（可环境变量覆盖） */
export function getPlazaUploadDir(): string {
  const p = process.env.PLAZA_UPLOAD_DIR?.trim();
  if (p) return p;
  return join(serverRoot, "uploads", "plaza");
}

export function ensurePlazaUploadDir(): string {
  const dir = getPlazaUploadDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
