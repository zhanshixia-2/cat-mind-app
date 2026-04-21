import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { getOpenAI } from "./providers/openai.js";
import {
  INNER_THOUGHT_SYSTEM,
  innerThoughtUserInstruction,
} from "./prompts.js";
import { getDailyUsage, refundDailySlot } from "../utils/dailyLimit.js";
import { truncateUnicode } from "../utils/text.js";

function mimeToDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

export type CatClassifyResult = {
  is_cat: boolean;
  confidence: number;
  reason?: string;
};

/** 与 POST /api/cat/analyze 的 JSON 体一致 */
export type CatPipelineResult =
  | { ok: true; text: string; remaining: number }
  | { ok: false; code: string; message: string; remaining: number };

/**
 * 当前：跳过第一次判猫，默认全部为猫；第二次多模态一次返回内心戏（非流式）。
 */
export async function runCatMindPipeline(
  mime: string,
  imageBase64: string,
  requestId: string,
): Promise<CatPipelineResult> {
  const classify: CatClassifyResult = {
    is_cat: true,
    confidence: 1,
    reason: undefined,
  };
  console.log(`[${requestId}] classify skipped, default is_cat=true`);

  const openai = getOpenAI();
  const url = mimeToDataUrl(mime, imageBase64);
  const userContent: ChatCompletionContentPart[] = [
    { type: "image_url", image_url: { url } },
    {
      type: "text",
      text: innerThoughtUserInstruction(
        config.maxInnerThoughtChars,
        classify.reason,
      ),
    },
  ];

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: config.visionModel,
      messages: [
        { role: "system", content: INNER_THOUGHT_SYSTEM },
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

  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  const text = truncateUnicode(raw, config.maxInnerThoughtChars);

  console.log(`[${requestId}] inner thought:`, text.slice(0, 300));

  return {
    ok: true,
    text,
    remaining: getDailyUsage(config.dailyUploadLimit).remaining,
  };
}
