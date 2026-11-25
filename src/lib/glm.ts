import { barsPrompt, summaryPrompt } from "./prompts";
import { evidenceCatalog as catalog } from "./evidence";
import { z, ZodError } from "zod";
import {
  GlmEvaluationOutputSchema,
  keys,
  type CandidateEvaluation,
  type ParsedCandidate,
} from "./types";
import { redactHaloFromText } from "./parser";
export const PROMPT_VERSION = "blind-bars-6";
export const DEFAULT_MODEL = "glm-4.5";
export const PROVIDER = "https://open.bigmodel.cn/api/paas/v4";
export interface ModelConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}
type Message = { role: "system" | "user"; content: string };
export class ModelError extends Error {
  constructor(
    message: string,
    public status = 502,
    public kind = "validation",
  ) {
    super(message);
  }
}
export function buildBlindEvaluationMessages(c: ParsedCandidate): Message[] {
  return [
    { role: "system", content: barsPrompt },
    {
      role: "user",
      content: JSON.stringify({
        阶段: redactHaloFromText(c.stage),
        方向: redactHaloFromText(c.direction),
        工具背景: redactHaloFromText(c.skills || ""),
        precheckSignals: c.precheckSignals,
        实践原文: catalog(c).map((quote, i) => ({ id: "E" + (i + 1), quote })),
      }),
    },
  ];
}
function json(raw: string) {
  return JSON.parse(
    raw
      .trim()
      .replace(/^ *\x60{3}(?:json)?\s*/i, "")
      .replace(/\s*\x60{3}\s*$/, ""),
  );
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function parseGlmJsonResponse(raw: string) {
  const obj: unknown = json(raw);
  if (isRecord(obj)) {
    const plan = obj.cultivationPlan;
    if (isRecord(plan)) {
      for (const k of ["direction", "growthFocus"])
        if (
          Array.isArray(plan[k]) &&
          (plan[k] as unknown[]).every((s) => typeof s === "string")
        )
          plan[k] = (plan[k] as string[]).join("、");
      if (typeof plan.suitableProjects === "string")
        plan.suitableProjects = [plan.suitableProjects];
    }
    if (isRecord(obj.dimensions))
      for (const d of Object.values(obj.dimensions)) {
        if (!isRecord(d)) continue;
        if (typeof d.evidenceQuotes === "string")
          d.evidenceQuotes = d.evidenceQuotes.trim() ? [d.evidenceQuotes] : [];
      }
  }
  return GlmEvaluationOutputSchema.parse(obj);
}
function grounded(raw: string, c: ParsedCandidate) {
  const output = parseGlmJsonResponse(raw),
    quotes = catalog(c);
  for (const k of keys) {
    const d = output.dimensions[k];
    d.evidenceQuotes = d.evidenceQuotes.map((q) => {
      const ref = q.match(/^E(\d+)$/i),
        resolved = ref ? quotes[Number(ref[1]) - 1] : q;
      if (
        !resolved ||
        resolved.length < 4 ||
        !quotes.some((v) => v.includes(resolved))
      )
        throw Error(k + " 使用了不存在的引文，请选有效 E 编号。");
      return resolved;
    });
  }
  return output;
}
async function completion<T>(
  messages: Message[],
  config: ModelConfig,
  validate: (raw: string) => T,
  fetchImpl: typeof fetch,
) {
  if (process.env.LLM_MODE && process.env.LLM_MODE !== "api")
    throw new ModelError("实时评估需要 LLM_MODE=api。", 400, "config");
  const base = (config.baseUrl || PROVIDER).replace(/\/+$/, "");
  if (base !== PROVIDER)
    throw new ModelError("端点必须是指定的智谱标准 API 地址。", 400, "config");
  let feedback = "",
    useFormat = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl(base + "/chat/completions", {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + config.apiKey,
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 2600,
          ...(/^glm-4\.5|^glm-4\.6|^glm-5/i.test(config.model)
            ? { thinking: { type: "disabled" } }
            : {}),
          ...(useFormat ? { response_format: { type: "json_object" } } : {}),
          messages: feedback
            ? [...messages, { role: "user", content: feedback }]
            : messages,
        }),
      });
      if (!r.ok) {
        const error = await r.json().catch(() => null);
        const code = String(error?.error?.code ?? "")
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 16);
        if (
          useFormat &&
          r.status === 400 &&
          /response_format|json_object/i.test(String(error?.error?.message))
        ) {
          useFormat = false;
          throw Error("请直接输出 JSON 对象。");
        }
        const retryable = r.status === 429 || r.status >= 500;
        throw new ModelError(
          "智谱请求返回 HTTP " +
            r.status +
            (code ? "（" + code + "）" : "") +
            "。",
          r.status === 401 || r.status === 403
            ? 401
            : r.status === 429
              ? 429
              : 502,
          retryable ? "transient" : "provider",
        );
      }
      const raw = (await r.json()).choices?.[0]?.message?.content;
      if (typeof raw !== "string") throw Error("响应缺少正文。");
      return validate(raw);
    } catch (error) {
      if (error instanceof ModelError && error.kind !== "transient")
        throw error;
      if (attempt === 1) {
        if (error instanceof ModelError) throw error;
        throw new ModelError("两次请求后仍未得到有效结果。" + reason(error));
      }
      feedback =
        "上次输出未通过检查。" + reason(error) + " 重新完整输出 JSON。";
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new ModelError("请求未完成");
}
function reason(e: unknown) {
  if (e instanceof ZodError)
    return (
      "请检查字段 " +
      e.issues
        .slice(0, 4)
        .map((i) => i.path.join(".") + "(" + i.code + ")")
        .join("、") +
      "。"
    );
  if (e instanceof SyntaxError) return "JSON 格式不完整。";
  if (e instanceof Error && /不存在的引文|直接输出|摘要长度/.test(e.message))
    return e.message;
  if (e instanceof Error && e.name === "TimeoutError")
    return "单次调用超过 45 秒。";
  return "请检查模型响应、网络或稍后重试。";
}
export async function evaluateCandidateWithGlm(
  c: ParsedCandidate,
  cfg: ModelConfig,
  fetchImpl = fetch,
) {
  return completion(
    buildBlindEvaluationMessages(c),
    cfg,
    (raw) => grounded(raw, c),
    fetchImpl,
  );
}
export const compactSchema = z.object({
  id: z.string().min(1).max(32),
  tier: z.enum(["S", "A+", "B", "C"]),
  score: z.number().min(0).max(100),
  verdict: z.string().max(700),
  risk: z.array(z.string().max(35)).max(5),
});
export type Compact = z.infer<typeof compactSchema>;
export function compact(e: CandidateEvaluation): Compact {
  return {
    id: e.candidate.id,
    tier: e.tier,
    score: e.compositeScore,
    verdict: e.glm.oneLineVerdict,
    risk: e.redFlags,
  };
}
export async function generateBatchSummaryWithGlm(
  items: Compact[],
  cfg: ModelConfig,
  fetchImpl = fetch,
) {
  return completion(
    [
      { role: "system", content: summaryPrompt },
      {
        role: "user",
        content: JSON.stringify({
          实际出现的层级: [...new Set(items.map((i) => i.tier))],
          候选人: items,
        }),
      },
    ],
    cfg,
    (raw) => {
      const s = z
        .object({ summary: z.string().trim().min(1).max(1300) })
        .parse(json(raw)).summary;
      const n = Array.from(s).length;
      if (n < 150 || n > 280)
        throw Error("摘要长度为 " + n + "，请严格调整至 150–280 字符。");
      return s;
    },
    fetchImpl,
  );
}
