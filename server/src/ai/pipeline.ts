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

// 第一次多模态「判猫」已暂时关闭（原 classifyCat / parseClassifyJson 见 git 历史）。
// 恢复两次调用时：从版本历史恢复 classifyCat，并 import CAT_CLASSIFY_SYSTEM，取消下方「默认全部为猫」逻辑。

/** NDJSON 行：推给前端解析 */
export type NdjsonLine =
  | { type: "meta"; ok: true; remaining: number }
  | { type: "delta"; text: string }
  | {
      type: "error";
      ok: false;
      code: string;
      message: string;
      remaining: number;
    }
  | { type: "done" };

/**
 * 当前：跳过第一次判猫，默认全部为猫；仅第二次多模态流式生成内心戏。
 */
export async function runCatMindPipelineStream(
  mime: string,
  imageBase64: string,
  requestId: string,
  onLine: (line: NdjsonLine) => void,
): Promise<void> {
  const classify: CatClassifyResult = {
    is_cat: true,
    confidence: 1,
    reason: undefined,
  };
  console.log(`[${requestId}] classify skipped, default is_cat=true`);

  // --- 恢复判猫时启用以下分支并删除上方 classify 默认值 ---
  // let classify: CatClassifyResult;
  // try {
  //   classify = await classifyCat(mime, imageBase64, requestId);
  // } catch (e) {
  //   refundDailySlot();
  //   throw e;
  // }
  // if (!classify.is_cat) { refundDailySlot(); onLine({ type: "error", ... }); return; }
  // if (classify.confidence < config.catConfidenceThreshold) { ... }

  onLine({
    type: "meta",
    ok: true,
    remaining: getDailyUsage(config.dailyUploadLimit).remaining,
  });

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

  let stream: AsyncIterable<{ choices: { delta?: { content?: string } }[] }>;
  try {
    stream = (await openai.chat.completions.create({
      model: config.visionModel,
      messages: [
        { role: "system", content: INNER_THOUGHT_SYSTEM },
        { role: "user", content: userContent },
      ],
      stream: true,
      max_tokens: 500,
    })) as AsyncIterable<{ choices: { delta?: { content?: string } }[] }>;
  } catch (e) {
    refundDailySlot();
    throw e;
  }

  let innerAcc = "";

  const emitDelta = (text: string) => {
    if (!text) return;
    const room = config.maxInnerThoughtChars - innerAcc.length;
    if (room <= 0) return;
    const slice =
      Array.from(text).length <= room
        ? text
        : truncateUnicode(text, room);
    innerAcc += slice;
    if (slice.length) onLine({ type: "delta", text: slice });
  };

  try {
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content ?? "";
      emitDelta(delta);
    }
  } catch (e) {
    refundDailySlot();
    throw e;
  }

  console.log(`[${requestId}] inner thought (stream end):`, innerAcc.slice(0, 300));
  onLine({ type: "done" });
}
