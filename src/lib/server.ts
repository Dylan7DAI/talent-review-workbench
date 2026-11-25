import { z, ZodError } from "zod";
import { DEFAULT_MODEL, ModelError } from "./glm";
export const credentials = {
  apiKey: z.string().trim().max(300).optional(),
  model: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{1,90}$/)
    .default(DEFAULT_MODEL),
};
export function modelConfig(
  input: { apiKey?: string; model: string },
  req: Request,
) {
  const host = req.headers.get("host") || new URL(req.url).host;
  const local = /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host);
  const allowLocal =
    local && process.env.NODE_ENV === "development" && !process.env.VERCEL;
  const apiKey =
    input.apiKey ||
    (allowLocal ? process.env.OPENAI_API_KEY || process.env.ZHIPU_API_KEY : "");
  if (!apiKey)
    throw new ModelError("请在模型设置中输入智谱 API Key。", 400, "config");
  return { apiKey, model: input.model, baseUrl: process.env.OPENAI_BASE_URL };
}
export async function readJson(req: Request) {
  const origin = req.headers.get("origin"),
    url = new URL(req.url);
  // Next may normalize loopback to localhost; Host retains the browser-facing authority.
  const publicHost = req.headers.get("host") || url.host;
  if (origin && origin !== url.protocol + "//" + publicHost)
    throw new ModelError("请求来源与当前服务不一致。", 403);
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ModelError("请提交 JSON。", 415);
  const limit = 100_000,
    reader = req.body?.getReader();
  if (!reader) throw new ModelError("请求体为空。", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ModelError("请求体超过 100 KB。", 413);
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)),
    );
  } catch {
    throw new ModelError("JSON 编码或格式错误。", 400);
  }
}
export function errResponse(e: unknown) {
  const status =
    e instanceof ZodError ? 400 : e instanceof ModelError ? e.status : 500;
  const message =
    e instanceof ZodError
      ? "输入字段不符合约定。"
      : e instanceof ModelError
        ? e.message
        : "服务暂时无法完成请求。";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
