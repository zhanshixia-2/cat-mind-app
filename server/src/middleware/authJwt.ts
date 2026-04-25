import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const COOKIE = "cat_mind_auth";

/** 邮箱登录用户 JWT，`sub` 为 `users.id` 字符串 */
export function signUserToken(userId: number): string {
  return jwt.sign(
    { v: 1, typ: "cat-mind", sub: String(userId) },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

export function getUserIdFromToken(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as {
      typ?: string;
      sub?: string;
    };
    if (p.typ !== "cat-mind" || typeof p.sub !== "string") return null;
    const id = Number.parseInt(p.sub, 10);
    if (!Number.isInteger(id) || id < 1) return null;
    return id;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  const userId = getUserIdFromToken(
    typeof token === "string" ? token : undefined,
  );
  if (userId == null) {
    res.status(401).json({ error: "需要登录", code: "UNAUTHORIZED" });
    return;
  }
  req.userId = userId;
  next();
};

/** 有 Cookie 则设置 `req.userId`，无则继续（用于可选登录接口） */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  const userId = getUserIdFromToken(
    typeof token === "string" ? token : undefined,
  );
  if (userId != null) {
    req.userId = userId;
  }
  next();
};

export { COOKIE };
