import { Router } from "express";
import { getDb } from "../db/index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { isValidEmail, normalizeEmail } from "../auth/validateEmail.js";
import {
  COOKIE,
  getUserIdFromToken,
  signUserToken,
} from "../middleware/authJwt.js";

const MIN_PW = 6;
const MAX_PW = 128;

function setAuthCookie(
  res: import("express").Response,
  userId: number,
): void {
  const token = signUserToken(userId);
  const cookieSecure =
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_COOKIE_SECURE !== "false";
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export const authRouter = Router();

/** 邮箱不存在则注册并登录，存在则校验密码登录（与客户端「单表单」对应） */
authRouter.post("/enter", (req, res) => {
  const email = normalizeEmail(
    typeof req.body?.email === "string" ? req.body.email : "",
  );
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "请填写有效邮箱", code: "BAD_EMAIL" });
    return;
  }
  if (password.length < MIN_PW || password.length > MAX_PW) {
    res
      .status(400)
      .json({ error: `密码请 ${MIN_PW}～${MAX_PW} 位`, code: "BAD_PASSWORD" });
    return;
  }
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; password_hash: string } | undefined;
  if (!row) {
    void (async () => {
      const passwordHash = await hashPassword(password);
      const r = db
        .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
        .run(email, passwordHash);
      const userId = Number(r.lastInsertRowid);
      setAuthCookie(res, userId);
      res.json({ ok: true, user: { id: userId, email } });
    })().catch((e) => {
      console.error(e);
      res.status(500).json({ error: "注册失败", code: "INTERNAL" });
    });
    return;
  }
  void (async () => {
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      res
        .status(401)
        .json({ error: "邮箱或密码错误", code: "BAD_CREDENTIALS" });
      return;
    }
    setAuthCookie(res, row.id);
    res.json({ ok: true, user: { id: row.id, email } });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ error: "登录失败", code: "INTERNAL" });
  });
});

authRouter.post("/register", (req, res) => {
  const email = normalizeEmail(
    typeof req.body?.email === "string" ? req.body.email : "",
  );
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "请填写有效邮箱", code: "BAD_EMAIL" });
    return;
  }
  if (password.length < MIN_PW || password.length > MAX_PW) {
    res
      .status(400)
      .json({ error: `密码请 ${MIN_PW}～${MAX_PW} 位`, code: "BAD_PASSWORD" });
    return;
  }
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: number } | undefined;
  if (exists) {
    res.status(409).json({ error: "该邮箱已注册，请直接登录", code: "EXISTS" });
    return;
  }
  void (async () => {
    const passwordHash = await hashPassword(password);
    const r = db
      .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
      .run(email, passwordHash);
    const userId = Number(r.lastInsertRowid);
    setAuthCookie(res, userId);
    res.json({ ok: true, user: { id: userId, email } });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ error: "注册失败", code: "INTERNAL" });
  });
});

authRouter.post("/login", (req, res) => {
  const email = normalizeEmail(
    typeof req.body?.email === "string" ? req.body.email : "",
  );
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!isValidEmail(email) || !password) {
    res.status(400).json({ error: "请填写邮箱和密码", code: "BAD_INPUT" });
    return;
  }
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; password_hash: string } | undefined;
  if (!row) {
    res.status(401).json({ error: "邮箱或密码错误", code: "BAD_CREDENTIALS" });
    return;
  }
  void (async () => {
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      res
        .status(401)
        .json({ error: "邮箱或密码错误", code: "BAD_CREDENTIALS" });
      return;
    }
    setAuthCookie(res, row.id);
    res.json({ ok: true, user: { id: row.id, email } });
  })().catch((e) => {
    console.error(e);
    res.status(500).json({ error: "登录失败", code: "INTERNAL" });
  });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const token = req.cookies?.[COOKIE];
  const userId = getUserIdFromToken(
    typeof token === "string" ? token : undefined,
  );
  if (userId == null) {
    res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
    return;
  }
  const db = getDb();
  const row = db
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .get(userId) as { id: number; email: string } | undefined;
  if (!row) {
    res.clearCookie(COOKIE, { path: "/" });
    res.status(401).json({ ok: false, code: "USER_GONE" });
    return;
  }
  res.json({ ok: true, user: { id: row.id, email: row.email } });
});
