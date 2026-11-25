import { it, expect } from "vitest";
import { computeCandidateEvaluation, recomputeBatch } from "../src/lib/scoring";
import { parseResumesMarkdown } from "../src/lib/parser";
import {
  keys,
  DEFAULT_WEIGHTS,
  type GlmEvaluationOutput,
} from "../src/lib/types";
export function sample(scores: number[]) {
  const c = parseResumesMarkdown(
    "## 候选人 01｜案例\n**科研经历**：\n- " +
      "独立进行了对照实验并验证结果。".repeat(18),
  ).candidates[0];
  const g: GlmEvaluationOutput = {
    dimensions: Object.fromEntries(
      keys.map((k, i) => [
        k,
        {
          score: scores[i],
          evidenceQuotes: scores[i]
            ? [["对照实验", "验证结果", "独立进行了", "实验并验证"][i]]
            : [],
          rationale: "核对实验",
        },
      ]),
    ) as GlmEvaluationOutput["dimensions"],
    redFlags: [],
    advanceRecommendation: "核对贡献",
    interviewQuestions: [
      { question: "为何选择该基线？", verifyHypothesis: "归因" },
      { question: "结果如何复现？", verifyHypothesis: "复现" },
    ],
    cultivationPlan: {
      direction: "研究",
      suitableProjects: ["两周对照"],
      growthFocus: "证据",
    },
    oneLineVerdict: "有实验材料",
  };
  return { c, g };
}
it("默认权重与两轴", () => {
  const { c, g } = sample([5, 4, 5, 4]);
  expect(computeCandidateEvaluation(c, g)).toMatchObject({
    compositeScore: 91,
    tier: "S",
    confidence: "high",
    researchTasteX: 4.55,
    executionLoopY: 4.56,
  });
});
it("保护工程尖峰与非典型人才", () => {
  const { c, g } = sample([2, 4, 5, 0]);
  c.haloMetadata.noPublishedPaper = true;
  expect(computeCandidateEvaluation(c, g)).toMatchObject({
    isSpiky: true,
    tier: "A+",
    haloContrast: "HIDDEN_GEM",
  });
});
it("光环反差增加一个独立归属问题", () => {
  const { c, g } = sample([2, 3, 2, 2]);
  c.haloMetadata.isTopSchool = true;
  g.redFlags = ["VAGUE_METRICS"];
  const e = computeCandidateEvaluation(c, g);
  expect(e.tier).toBe("B");
  expect(e.haloContrast).toBe("HALO_EVIDENCE_GAP");
  expect(recomputeBatch([e])[0].interviewQuestions).toHaveLength(3);
});
it("零分与单项满分均保留待核验", () => {
  for (const s of [
    [0, 0, 0, 0],
    [0, 0, 0, 5],
  ]) {
    const { c, g } = sample(s);
    const e = computeCandidateEvaluation(c, g);
    expect(e.confidence).toBe("low");
    expect(e.tier).toBe("B");
    expect(e.compositeScore).toBeLessThanOrEqual(65);
  }
});
it("全零及局部零权重安全重排", () => {
  const { c, g } = sample([5, 4, 3, 2]);
  const e = computeCandidateEvaluation(c, g);
  expect(
    recomputeBatch([e], {
      attribution: 0,
      problem_formulation: 0,
      engineering_velocity: 0,
      data_scaling: 0,
    })[0].compositeScore,
  ).toBe(e.compositeScore);
  expect(
    recomputeBatch([e], {
      ...DEFAULT_WEIGHTS,
      attribution: 0,
      problem_formulation: 0,
    })[0].researchTasteX,
  ).toBe(4.55);
});

it("材料稀疏信号取自预检，保留可审计的模型原始标签", () => {
  const { c, g } = sample([4, 4, 4, 4]);
  g.redFlags = ["SPARSE_RESUME"];
  const result = computeCandidateEvaluation(c, g);
  expect(result.glm.redFlags).toContain("SPARSE_RESUME");
  expect(result.redFlags).not.toContain("SPARSE_RESUME");
  expect(result.confidence).toBe("high");
});
