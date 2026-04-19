import { Router } from "express";
import { config } from "../config.js";
import { COOKIE, signAuthCookie, verifyAuthToken } from "../middleware/authJwt.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const password =
    (typeof req.body?.password === "string" ? req.body.password : "").trim();
  if (password !== config.appPassword) {
    res.status(401).json({ error: "密码错误", code: "BAD_PASSWORD" });
    return;
  }
  const token = signAuthCookie();
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token || !verifyAuthToken(token)) {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});
