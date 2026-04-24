import { createHash, randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const COOKIE = "cat_mind_auth";

export function signAuthCookie(): string {
  return jwt.sign(
    { v: 1, typ: "cat-mind", plz: randomUUID() },
    config.jwtSecret,
    {
      expiresIn: "7d",
    },
  );
}

export function verifyAuthToken(token: string): boolean {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { typ?: string };
    return p.typ === "cat-mind";
  } catch {
    return false;
  }
}

/**
 * 广场帖作者标识：新 Cookie 带 `plz`；旧 Cookie 用 token 的哈希兜底（稳定、可区分会话）
 */
export function authorIdFromAuthToken(
  token: string | undefined,
): string | null {
  if (!token || !verifyAuthToken(token)) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as {
      typ?: string;
      plz?: string;
    };
    if (p.typ !== "cat-mind") return null;
    if (typeof p.plz === "string" && p.plz.length > 0) return p.plz;
    return `legacy:${createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token || !verifyAuthToken(token)) {
    res.status(401).json({ error: "需要登录", code: "UNAUTHORIZED" });
    return;
  }
  next();
};

export { COOKIE };
