import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getSqlitePath } from "./paths.js";

const MIG_001 = `
CREATE TABLE IF NOT EXISTS plaza_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL,
  text_content TEXT NOT NULL,
  image_filename TEXT NOT NULL UNIQUE,
  image_width INTEGER,
  image_height INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plaza_posts_list
  ON plaza_posts (status, id);
`;

let db: DatabaseSync | null = null;

function ensureDirForFile(file: string) {
  const d = dirname(file);
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}

/**
 * 启动时调用一次；建库文件 + 跑迁移
 * 使用 Node 22+ 内置 `node:sqlite`（无需 native 依赖，见 package.json engines）
 */
export function initDb(): DatabaseSync {
  if (db) return db;
  const path = getSqlitePath();
  ensureDirForFile(path);
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(MIG_001);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}
