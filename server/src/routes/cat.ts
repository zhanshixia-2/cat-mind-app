import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Router } from "express";
import multer from "multer";
import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { ensureReadingsUploadDir } from "../db/paths.js";
import { runCatMindPipeline } from "../ai/pipeline.js";
import { requireAuth } from "../middleware/authJwt.js";
import {
  getDailyUsage,
  refundDailySlot,
  tryConsumeDailySlot,
} from "../utils/dailyLimit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(null, ok);
  },
});

function extForUploadedPhoto(mimetype: string): string {
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/gif") return ".gif";
  return ".jpg";
}

const handleUpload: RequestHandler = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      res.status(400).json({
        error: "请上传 JPG / PNG / WebP / GIF，单张不超过 5MB",
        code: "UPLOAD_BAD",
      });
      return;
    }
    next();
  });
};

export const catRouter = Router();

catRouter.get("/usage", requireAuth, (_req, res) => {
  const u = getDailyUsage(config.dailyUploadLimit);
  res.json(u);
});

const handleAnalyze: RequestHandler = async (req, res) => {
  const requestId = randomUUID();
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "请上传图片文件", code: "NO_FILE" });
    return;
  }

  const { ok: slotOk } = tryConsumeDailySlot(config.dailyUploadLimit);
  if (!slotOk) {
    res.status(429).json({
      error: "今日全站额度已用完（50 张），请明天再来～",
      code: "RATE_LIMIT",
      remaining: 0,
    });
    return;
  }

  const mime = req.file.mimetype;
  const imageBase64 = req.file.buffer.toString("base64");

  try {
    const result = await runCatMindPipeline(mime, imageBase64, requestId);
    if (result.ok) {
      const sourceName = `${randomUUID()}${extForUploadedPhoto(mime)}`;
      const abs = join(ensureReadingsUploadDir(), sourceName);
      try {
        writeFileSync(abs, req.file.buffer);
      } catch (writeErr) {
        refundDailySlot();
        console.error(writeErr);
        res.status(500).json({ error: "保存配图失败", code: "INTERNAL" });
        return;
      }
      let ins: { lastInsertRowid: number | bigint };
      try {
        ins = getDb()
          .prepare(
            `INSERT INTO user_readings (user_id, result_text, source_image_filename)
             VALUES (?, ?, ?)`,
          )
          .run(req.userId!, result.text, sourceName);
      } catch (dbErr) {
        try {
          unlinkSync(abs);
        } catch {
          /* ignore */
        }
        refundDailySlot();
        console.error(dbErr);
        res.status(500).json({ error: "保存记录失败", code: "INTERNAL" });
        return;
      }
      res.json({
        ...result,
        readingId: Number(ins.lastInsertRowid),
      });
      return;
    }
    res.json(result);
  } catch (e) {
    refundDailySlot();
    console.error(`[${requestId}]`, e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "服务器错误",
      code: "INTERNAL",
    });
  }
};

catRouter.post("/analyze", requireAuth, handleUpload, handleAnalyze);
