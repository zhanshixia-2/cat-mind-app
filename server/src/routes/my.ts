import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import { getDb } from "../db/index.js";
import {
  ensurePlazaUploadDir,
  ensureReadingsUploadDir,
} from "../db/paths.js";
import { requireAuth } from "../middleware/authJwt.js";

export const myRouter = Router();

const UUID_PLAZA_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i;
const UUID_READING_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

/**
 * 本人读猫历史用图：含已下架广场帖（/api/plaza/files 仅 active，此处按用户校验）
 */
myRouter.get("/plaza-files/:name", requireAuth, (req, res) => {
  const name = req.params["name"] ?? "";
  if (!UUID_PLAZA_FILE.test(name)) {
    res.status(400).end();
    return;
  }
  const row = getDb()
    .prepare(
      `SELECT id FROM plaza_posts
       WHERE image_filename = ? AND user_id = ?`,
    )
    .get(name, req.userId!) as { id: number } | undefined;
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
  res.setHeader("Cache-Control", "private, max-age=300");
  createReadStream(abs).on("error", () => res.status(500).end()).pipe(res);
});

/** 读猫时落盘的用户原图（未发广场也可在「我的」展示） */
myRouter.get("/reading-files/:name", requireAuth, (req, res) => {
  const name = req.params["name"] ?? "";
  if (!UUID_READING_FILE.test(name)) {
    res.status(400).end();
    return;
  }
  const row = getDb()
    .prepare(
      `SELECT id FROM user_readings
       WHERE source_image_filename = ? AND user_id = ?`,
    )
    .get(name, req.userId!) as { id: number } | undefined;
  if (!row) {
    res.status(404).end();
    return;
  }
  const abs = join(ensureReadingsUploadDir(), name);
  if (!existsSync(abs)) {
    res.status(404).end();
    return;
  }
  const lower = name.toLowerCase();
  const ext = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : lower.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";
  res.setHeader("Content-Type", ext);
  res.setHeader("Cache-Control", "private, max-age=300");
  createReadStream(abs).on("error", () => res.status(500).end()).pipe(res);
});

myRouter.get("/readings", requireAuth, (req, res) => {
  const userId = req.userId!;
  const rows = getDb()
    .prepare(
      `SELECT
        ur.id,
        ur.result_text,
        ur.created_at,
        ur.source_image_filename AS source_image,
        pp.id AS plaza_id,
        pp.status AS plaza_status,
        pp.image_filename AS plaza_image
      FROM user_readings ur
      LEFT JOIN plaza_posts pp ON pp.user_reading_id = ur.id
      WHERE ur.user_id = ?
      ORDER BY ur.id DESC
      LIMIT 200`,
    )
    .all(userId) as {
      id: number;
      result_text: string;
      created_at: string;
      source_image: string | null;
      plaza_id: number | null;
      plaza_status: string | null;
      plaza_image: string | null;
    }[];

  res.json({
    items: rows.map((r) => {
      const onPlaza = r.plaza_status === "active";
      const imageUrl =
        r.plaza_id != null && r.plaza_image
          ? `/api/my/plaza-files/${encodeURIComponent(r.plaza_image)}`
          : r.source_image
            ? `/api/my/reading-files/${encodeURIComponent(r.source_image)}`
            : null;
      return {
        id: r.id,
        text: r.result_text,
        createdAt: r.created_at,
        imageUrl,
        plaza:
          r.plaza_id != null
            ? {
                id: r.plaza_id,
                onPlaza,
                canTakedown: onPlaza,
              }
            : null,
      };
    }),
  });
});

/**
 * 广场下架：仅隐藏，不删读猫历史、不删广场行（仍关联 user_reading）
 */
myRouter.post("/plaza/:id/takedown", requireAuth, (req, res) => {
  const postId = Number.parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isInteger(postId) || postId < 1) {
    res.status(400).json({ error: "无效 id" });
    return;
  }
  const r = getDb()
    .prepare(
      `UPDATE plaza_posts SET status = 'hidden'
       WHERE id = ? AND user_id = ? AND status = 'active'`,
    )
    .run(postId, req.userId!);
  if (r.changes === 0) {
    res.status(404).json({ error: "未找到可下架的帖子" });
    return;
  }
  res.json({ ok: true });
});
