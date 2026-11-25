import { readFileSync } from "node:fs";
import { parseResumesMarkdown } from "../src/lib/parser";
import { keys, type GlmEvaluationOutput } from "../src/lib/types";
export const candidates = parseResumesMarkdown(
  readFileSync("src/data/10_ai_phd_resumes.md", "utf8"),
).candidates;
export function response(quote = "E1"): GlmEvaluationOutput {
  return {
    dimensions: Object.fromEntries(
      keys.map((k) => [
        k,
        {
          score: 3,
          evidenceQuotes: [quote],
          rationale: "可核实的设计和实验。",
        },
      ]),
    ) as GlmEvaluationOutput["dimensions"],
    redFlags: [],
    advanceRecommendation: "核对实验基线",
    oneLineVerdict: "贡献边界需要复核",
    interviewQuestions: [
      { question: "为什么这样设计？", verifyHypothesis: "个人归因" },
      { question: "结果如何对照？", verifyHypothesis: "验证方法" },
    ],
    cultivationPlan: {
      direction: "做对照实验",
      suitableProjects: ["复现项目"],
      growthFocus: "关注误差",
    },
  };
}
