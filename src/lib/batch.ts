import {
  GlmEvaluationOutputSchema,
  weightSchema,
  type BatchSnapshot,
  type CandidateEvaluation,
} from "./types";
import { parseResumesMarkdown } from "./parser";
import { recomputeBatch, computeCandidateEvaluation } from "./scoring";
export const CACHE_KEY = "yanpan.glm.v2";
export type Job = {
  state: "queued" | "running" | "done" | "error";
  ms: number;
  start?: number;
  error?: string;
};
export async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all([worker(), worker()]);
}
export function restoreSnapshot(raw: unknown): BatchSnapshot | null {
  try {
    const s = raw as BatchSnapshot;
    if (
      !s ||
      s.version !== 2 ||
      !["verified", "live"].includes(s.source) ||
      typeof s.model !== "string" ||
      typeof s.summary !== "string" ||
      typeof s.markdown !== "string" ||
      !s.markdown.trim() ||
      new TextEncoder().encode(s.markdown).length > 100000 ||
      !Array.isArray(s.evaluations) ||
      !Number.isFinite(Date.parse(s.createdAt))
    )
      return null;
    const weights = weightSchema.parse(s.weights),
      cs = parseResumesMarkdown(s.markdown).candidates;
    if (cs.length > 20 || cs.length === 0 || s.evaluations.length > cs.length)
      return null;
    const seen = new Set<string>();
    const rows: CandidateEvaluation[] = [];
    for (const e of s.evaluations) {
      const c = cs.find((c) => c.id === e.candidate.id);
      if (!c || seen.has(c.id) || c.raw !== e.candidate.raw) return null;
      seen.add(c.id);
      const g = GlmEvaluationOutputSchema.parse(e.glm);
      if (
        Object.values(g.dimensions).some((d) =>
          d.evidenceQuotes.some(
            (q) => !c.blindWorkEvidence.includes(q) || !c.raw.includes(q),
          ),
        )
      )
        return null;
      rows.push(computeCandidateEvaluation(c, g, weights));
    }
    return {
      version: 2,
      source: s.source,
      markdown: s.markdown,
      model: s.model,
      createdAt: s.createdAt,
      weights,
      summary: s.summary,
      evaluations: recomputeBatch(rows, weights),
    };
  } catch {
    return null;
  }
}
