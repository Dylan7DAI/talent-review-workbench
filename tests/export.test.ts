import { it, expect } from "vitest";
import { exportBatchToMarkdown } from "../src/lib/export";
import { recomputeBatch, computeCandidateEvaluation } from "../src/lib/scoring";
import { DEFAULT_WEIGHTS } from "../src/lib/types";
import { candidates, response } from "./fixture";
import { restoreSnapshot, pool } from "../src/lib/batch";
it("包含排序和三项决策，带引文", () => {
  const c = candidates[0],
    g = response("方案设计与全部实验");
  const e = computeCandidateEvaluation(c, g),
    md = exportBatchToMarkdown(recomputeBatch([e]), "摘要", DEFAULT_WEIGHTS);
  for (const v of [
    "排名",
    "是否建议推进",
    "面谈重点追问",
    "建议培养方向",
    e.tier,
    "> 方案设计与全部实验",
  ])
    expect(md).toContain(v);
});
it("缓存按原文重算并拒绝串人引用、截断或旧结构", () => {
  const c = candidates[0],
    g = response("方案设计与全部实验"),
    e = computeCandidateEvaluation(c, g);
  const snap = {
    version: 2,
    source: "live",
    model: "test",
    markdown: c.raw,
    createdAt: new Date().toISOString(),
    weights: DEFAULT_WEIGHTS,
    summary: "",
    evaluations: [e],
  };
  expect(restoreSnapshot(snap)?.evaluations[0].candidate.id).toBe(c.id);
  e.glm.dimensions.attribution.evidenceQuotes = ["别人的材料"];
  expect(restoreSnapshot(snap)).toBe(null);
  expect(restoreSnapshot({})).toBe(null);
});
it("批处理只使用两个并发槽", async () => {
  let active = 0,
    peak = 0,
    done = 0;
  await pool([1, 2, 3, 4], async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 8));
    active--;
    done++;
  });
  expect(peak).toBe(2);
  expect(done).toBe(4);
});
