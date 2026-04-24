-- 猫猫心里话广场
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
  ON plaza_posts (status, id DESC);
