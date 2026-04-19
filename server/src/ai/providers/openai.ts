import OpenAI from "openai";
import { config } from "../../config.js";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("未配置 OPENAI_API_KEY");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseURL,
    });
  }
  return client;
}
