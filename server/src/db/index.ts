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

const MIG_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  result_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_user_readings_user_id ON user_readings (user_id, id DESC);
`;

let db: DatabaseSync | null = null;

function migratePlazaColumns(database: DatabaseSync) {
  const rows = database
    .prepare("PRAGMA table_info(plaza_posts)")
    .all() as { name: string }[];
  const names = new Set(rows.map((r) => r.name));
  if (!names.has("user_id")) {
    database.exec("ALTER TABLE plaza_posts ADD COLUMN user_id INTEGER");
  }
  if (!names.has("user_reading_id")) {
    database.exec("ALTER TABLE plaza_posts ADD COLUMN user_reading_id INTEGER");
  }
}

function migrateUserReadingsSourceImage(database: DatabaseSync) {
  const rows = database
    .prepare("PRAGMA table_info(user_readings)")
    .all() as { name: string }[];
  const names = new Set(rows.map((r) => r.name));
  if (!names.has("source_image_filename")) {
    database.exec(
      "ALTER TABLE user_readings ADD COLUMN source_image_filename TEXT",
    );
  }
}

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
  db.exec(MIG_USERS);
  migratePlazaColumns(db);
  migrateUserReadingsSourceImage(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}
