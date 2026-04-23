import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { getOpenAI } from "./providers/openai.js";
import { getDailyUsage, refundDailySlot } from "../utils/dailyLimit.js";
import { truncateUnicode } from "../utils/text.js";
import { AGE_SYSTEM, ageUserText } from "./agePrompts.js";

function mimeToDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

function parseAgeJson(
  raw: string,
): { age: number; comment: string } | null {
  const t = raw.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)!) as {
      age?: unknown;
      comment?: unknown;
    };
    const ageNum = Number(o.age);
    if (!Number.isFinite(ageNum)) return null;
    const age = Math.round(Math.max(0, Math.min(120, ageNum)));
    const c =
      typeof o.comment === "string"
        ? truncateUnicode(
            o.comment.trim(),
            config.maxAgeCommentChars,
          )
        : "";
    if (!c) return null;
    return { age, comment: c };
  } catch {
    return null;
  }
}

export type AgePipelineResult =
  | { ok: true; age: number; comment: string; remaining: number }
  | { ok: false; code: string; message: string; remaining: number };

export async function runAgePipeline(
  mime: string,
  imageBase64: string,
  requestId: string,
): Promise<AgePipelineResult> {
  const openai = getOpenAI();
  const url = mimeToDataUrl(mime, imageBase64);
  const userContent: ChatCompletionContentPart[] = [
    { type: "image_url", image_url: { url } },
    {
      type: "text",
      text: ageUserText(config.maxAgeCommentChars),
    },
  ];

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: config.visionModel,
      messages: [
        { role: "system", content: AGE_SYSTEM },
        { role: "user", content: userContent },
      ],
      stream: false,
      max_tokens: 500,
    });
  } catch (e) {
    refundDailySlot();
    const msg = e instanceof Error ? e.message : "模型请求失败";
    return {
      ok: false,
      code: "AI_ERROR",
      message: msg,
      remaining: getDailyUsage(config.dailyUploadLimit).remaining,
    };
  }

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseAgeJson(raw);
  if (!parsed) {
    refundDailySlot();
    return {
      ok: false,
      code: "PARSE_ERROR",
      message: "无法解析年龄结果，请换一张清晰正脸照重试",
      remaining: getDailyUsage(config.dailyUploadLimit).remaining,
    };
  }

  console.log(`[${requestId}] age:`, parsed.age, parsed.comment.slice(0, 80));

  return {
    ok: true,
    age: parsed.age,
    comment: parsed.comment,
    remaining: getDailyUsage(config.dailyUploadLimit).remaining,
  };
}
