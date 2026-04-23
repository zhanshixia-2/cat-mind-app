import { Router } from "express";
import multer from "multer";
import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { runAgePipeline } from "../ai/agePipeline.js";
import { requireAuth } from "../middleware/authJwt.js";
import {
  getDailyUsage,
  refundDailySlot,
  tryConsumeDailySlot,
} from "../utils/dailyLimit.js";
import { isAllowedImageMimetype } from "../utils/multerImage.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    cb(null, isAllowedImageMimetype(file.mimetype));
  },
});

const handleUpload: RequestHandler = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      const code =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "LIMIT_FILE_SIZE"
          ? "FILE_TOO_LARGE"
          : "UPLOAD_BAD";
      res.status(400).json({
        error:
          code === "FILE_TOO_LARGE"
            ? "单张图片不超过 5MB"
            : "请上传 JPG / PNG / WebP / GIF 格式的图片",
        code,
      });
      return;
    }
    next();
  });
};

export const ageRouter = Router();

const handleAnalyze: RequestHandler = async (req, res) => {
  const requestId = randomUUID();
  if (!req.file?.buffer?.length) {
    res.status(400).json({
      error: "未收到图片：请用 multipart 表单字段名 photo 上传文件",
      code: "NO_FILE",
    });
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
    const result = await runAgePipeline(mime, imageBase64, requestId);
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

ageRouter.post("/analyze", requireAuth, handleUpload, handleAnalyze);
