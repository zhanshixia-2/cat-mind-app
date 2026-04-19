import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const COOKIE = "cat_mind_auth";

export function signAuthCookie(): string {
  return jwt.sign({ v: 1, typ: "cat-mind" }, config.jwtSecret, {
    expiresIn: "7d",
  });
}

export function verifyAuthToken(token: string): boolean {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { typ?: string };
    return p.typ === "cat-mind";
  } catch {
    return false;
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
