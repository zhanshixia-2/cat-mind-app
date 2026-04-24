import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 项目根目录 .env（npm workspaces 下 dev 时 cwd 常在 server/，默认 dotenv 读不到根目录） */
const rootEnv = join(__dirname, "../../.env");
const serverEnv = join(__dirname, "../.env");
/** override：否则系统/PM2 里已存在的空变量会挡住 .env（本机无预置变量故正常，服务器常见） */
dotenv.config({ path: rootEnv, override: true });
dotenv.config({ path: serverEnv, override: true });

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function envTrim(name: string, fallback?: string): string {
  return req(name, fallback).trim();
}

/**
 * 规范化 API Key：trim + 去掉外层成对引号（可多剥一层，兼容 .env 里写 "sk-sp-..."）
 * sk-sp- 为百炼/模型服务常见前缀，无需改代码
 */
function sanitizeApiKey(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * 百炼 OpenAI 兼容模式 Base URL（末尾不要带 /）
 * 仅填 DASHSCOPE_API_KEY 时自动使用，避免漏配导致请求打到 OpenAI 官方域名
 */
const DASHSCOPE_COMPAT_BASE =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

function resolveOpenAiBaseUrl(): string | undefined {
  const fromEnv = process.env.OPENAI_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (process.env.USE_DASHSCOPE_COMPAT === "true") {
    return DASHSCOPE_COMPAT_BASE;
  }
  const hasDashKey = Boolean(
    sanitizeApiKey(process.env.DASHSCOPE_API_KEY ?? ""),
  );
  if (hasDashKey) {
    return DASHSCOPE_COMPAT_BASE;
  }
  return undefined;
}

const rawApiKey =
  process.env.OPENAI_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";

/**
 * 未配置 OPENAI_VISION_MODEL 时：
 * - 走百炼兼容接口 → 默认 qwen3-vl-flash（性价比高，多数账号可用；若仍 400 请在控制台换模型名）
 * - 否则 → gpt-4o-mini（OpenAI 官方）
 */
function resolveVisionModel(): string {
  const fromEnv = process.env.OPENAI_VISION_MODEL?.trim();
  if (fromEnv) return fromEnv;
  const base = resolveOpenAiBaseUrl();
  const hasDashKey = Boolean(
    sanitizeApiKey(process.env.DASHSCOPE_API_KEY ?? ""),
  );
  const useDash =
    hasDashKey ||
    Boolean(base?.includes("dashscope.aliyuncs.com")) ||
    process.env.USE_DASHSCOPE_COMPAT === "true";
  if (useDash) {
    return "qwen3-vl-flash";
  }
  return "gpt-4o-mini";
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  appPassword: envTrim("APP_PASSWORD", "dev-password-change-me"),
  jwtSecret: envTrim("JWT_SECRET", "dev-jwt-secret-change-me-in-production"),
  /** 百炼 / DashScope：填 DASHSCOPE_API_KEY 或 OPENAI_API_KEY（二选一） */
  openaiApiKey: sanitizeApiKey(rawApiKey),
  openaiBaseURL: resolveOpenAiBaseUrl(),
  visionModel: resolveVisionModel(),
  /**
   * 第一次「猫判定」是否使用 response_format=json_object（部分百炼模型不支持）
   * 若报错可设 CLASSIFY_JSON_FORMAT=false，仅依赖提示词输出 JSON
   */
  classifyUseJsonResponseFormat: process.env.CLASSIFY_JSON_FORMAT !== "false",
  /** 猫判定置信度阈值 */
  catConfidenceThreshold: 0.7,
  /** 内心戏输出上限（固定文案一般远小于此，仅作兜底截断） */
  maxInnerThoughtChars: 30,
  /** 年龄评照片：生成点评长度上限 */
  maxAgeCommentChars: Number(
    process.env.MAX_AGE_COMMENT_CHARS ?? 300,
  ),
  /** 全站每日上传上限（进入 AI 流程即计数） */
  dailyUploadLimit: 50,
  /** 单图最大体积 */
  maxFileBytes: 5 * 1024 * 1024,
};
