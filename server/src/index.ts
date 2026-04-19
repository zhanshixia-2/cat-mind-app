import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { catRouter } from "./routes/cat.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cat-mind-server" });
});

app.use("/api/auth", authRouter);
app.use("/api/cat", catRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const msg = err instanceof Error ? err.message : "未知错误";
    res.status(500).json({ error: msg, code: "INTERNAL" });
  },
);

app.listen(config.port, () => {
  console.log(`cat-mind-server http://localhost:${config.port}`);
});
