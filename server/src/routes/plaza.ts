import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, unlinkSync } from "node:fs";
import { extname, join, basename } from "node:path";
import { Router } from "express";
import multer from "multer";
import { getDb } from "../db/index.js";
import { ensurePlazaUploadDir, getPlazaUploadDir } from "../db/paths.js";
import { requireAuth } from "../middleware/authJwt.js";

const router = Router();

const MAX_TEXT = 4000;
const PAGE = 20;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensurePlazaUploadDir());
  },
  filename: (_req, file, cb) => {
    const ext =
      file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/jpeg" || file.mimetype === "image/pjpeg"
          ? ".jpg"
          : file.mimetype === "image/webp"
            ? ".webp"
            : extname(file.originalname) || ".png";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/pjpeg" ||
      file.mimetype === "image/webp"
    ) {
      cb(null, true);
    } else {
      cb(new Error("只支持 PNG / JPEG / WebP 图片"));
    }
  },
});

function safeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_TEXT);
}

/** 列表与图片：公开（未登录可逛广场）；发布仍须登录 */
router.get("/posts", (req, res) => {
  const raw = req.query.cursor;
  const cursor =
    typeof raw === "string" && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;

  const db = getDb();
  let rows: {
    id: number;
    text_content: string;
    image_filename: string;
    created_at: string;
  }[];
  if (cursor != null) {
    rows = db
      .prepare(
        `SELECT id, text_content, image_filename, created_at
         FROM plaza_posts
         WHERE status = 'active' AND id < ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(cursor, PAGE + 1) as typeof rows;
  } else {
    rows = db
      .prepare(
        `SELECT id, text_content, image_filename, created_at
         FROM plaza_posts
         WHERE status = 'active'
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(PAGE + 1) as typeof rows;
  }

  const hasMore = rows.length > PAGE;
  const pageRows = hasMore ? rows.slice(0, PAGE) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? pageRows[pageRows.length - 1]!.id
      : null;

  res.json({
    items: pageRows.map((r) => ({
      id: r.id,
      text: r.text_content,
      imageUrl: `/api/plaza/files/${encodeURIComponent(r.image_filename)}`,
      createdAt: r.created_at,
    })),
    nextCursor,
  });
});

router.post(
  "/posts",
  requireAuth,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: String(err.message) });
        return;
      }
      next();
    });
  },
  (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "请上传图片（与保存时相同的长图）" });
      return;
    }
    const userId = req.userId!;
    const userReadingId = Number.parseInt(
      String(req.body?.userReadingId ?? req.body?.user_reading_id ?? ""),
      10,
    );
    if (!Number.isInteger(userReadingId) || userReadingId < 1) {
      res.status(400).json({ error: "需要 userReadingId" });
      return;
    }
    const text = safeText(req.body?.text);
    if (!text) {
      res.status(400).json({ error: "请提供心里话文字" });
      return;
    }
    const filename = basename(file.filename);
    if (filename !== file.filename) {
      res.status(400).json({ error: "非法文件名" });
      return;
    }
    const abs = join(getPlazaUploadDir(), filename);
    if (!existsSync(abs)) {
      res.status(500).json({ error: "文件写入失败" });
      return;
    }

    const db = getDb();
    const readRow = db
      .prepare(
        "SELECT id, result_text FROM user_readings WHERE id = ? AND user_id = ?",
      )
      .get(userReadingId, userId) as
      | { id: number; result_text: string }
      | undefined;
    if (!readRow) {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
      res.status(403).json({ error: "该读猫记录不存在或无权操作" });
      return;
    }
    const expect =
      "【咪想告诉你：】" + readRow.result_text;
    if (text !== readRow.result_text && text !== expect) {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "文案与读猫记录不一致" });
      return;
    }
    const textToStore = expect;

    const ex = db
      .prepare("SELECT id, status, image_filename FROM plaza_posts WHERE user_reading_id = ?")
      .get(userReadingId) as
      | { id: number; status: string; image_filename: string }
      | undefined;

    if (ex?.status === "active") {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
      res.status(409).json({ error: "该记录已在广场展示，请勿重复发布" });
      return;
    }

    const authorId = `u${userId}`;

    if (ex && ex.status === "hidden") {
      const oldPath = join(getPlazaUploadDir(), ex.image_filename);
      if (ex.image_filename && existsSync(oldPath)) {
        try {
          unlinkSync(oldPath);
        } catch {
          /* ignore */
        }
      }
      db.prepare(
        `UPDATE plaza_posts
         SET user_id = ?, text_content = ?, image_filename = ?, status = 'active'
         WHERE id = ?`,
      ).run(userId, textToStore, filename, ex.id);
      res.status(201).json({
        ok: true,
        id: ex.id,
        imageUrl: `/api/plaza/files/${encodeURIComponent(filename)}`,
        updated: true,
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO plaza_posts (author_id, user_id, user_reading_id, text_content, image_filename)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(authorId, userId, userReadingId, textToStore, filename);

    res.status(201).json({
      ok: true,
      id: Number(info.lastInsertRowid),
      imageUrl: `/api/plaza/files/${encodeURIComponent(filename)}`,
    });
  },
);

/** 公开读图（与列表一致）；文件名须为合法 UUID，且库中存在 */
router.get("/files/:name", (req, res) => {
  const name = req.params["name"] ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i.test(
    name,
  )) {
    res.status(400).end();
    return;
  }
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM plaza_posts WHERE image_filename = ? AND status = 'active'",
    )
    .get(name) as { id: number } | undefined;
  if (!row) {
    res.status(404).end();
    return;
  }
  const abs = join(ensurePlazaUploadDir(), name);
  if (!existsSync(abs)) {
    res.status(404).end();
    return;
  }
  const ext = name.toLowerCase().endsWith(".png")
    ? "image/png"
    : name.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  res.setHeader("Content-Type", ext);
  res.setHeader("Cache-Control", "public, max-age=3600");
  createReadStream(abs).on("error", () => res.status(500).end()).pipe(res);
});

export const plazaRouter = router;
