import { Router } from "express";
import multer from "multer";
import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { runCatMindPipelineStream } from "../ai/pipeline.js";
import { requireAuth } from "../middleware/authJwt.js";
import {
  getDailyUsage,
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

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await runCatMindPipelineStream(mime, imageBase64, requestId, (line) => {
      res.write(`${JSON.stringify(line)}\n`);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "服务器错误";
    console.error(`[${requestId}]`, e);
    try {
      res.write(
        `${JSON.stringify({
          type: "error",
          ok: false,
          code: "AI_ERROR",
          message: msg,
          remaining: getDailyUsage(config.dailyUploadLimit).remaining,
        })}\n`,
      );
    } catch {
      /* ignore write after close */
    }
  } finally {
    res.end();
  }
};

catRouter.post("/analyze", requireAuth, handleUpload, handleAnalyze);
