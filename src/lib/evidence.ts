import type { ParsedCandidate, GlmEvaluationOutput } from "./types";
export function evidenceCatalog(c: ParsedCandidate) {
  const fragments = c.blindWorkEvidence
    .split(/\n|〔隐去〕/)
    .flatMap((s) => s.split(/(?<=[。；;])/));
  const exact = fragments
    .map((s) => s.trim())
    .map((s) => (c.raw.includes(s) ? s : s.slice(s.indexOf("：") + 1).trim()));
  return [...new Set(exact.filter((s) => s.length >= 4 && c.raw.includes(s)))];
}
export function localLine(c: ParsedCandidate, s: string) {
  return c.raw.split("\n").findIndex((l) => l.includes(s)) + 1;
}
export function readableAssessment(
  c: ParsedCandidate,
  g: GlmEvaluationOutput,
): GlmEvaluationOutput {
  const quotes = evidenceCatalog(c);
  function prose(s: string) {
    return s.replace(/\bE(\d+)\b/gi, (_, n) => {
      const q = quotes[Number(n) - 1];
      return q ? "原文第 " + localLine(c, q) + " 行" : "该项材料";
    });
  }
  return {
    ...g,
    dimensions: Object.fromEntries(
      Object.entries(g.dimensions).map(([k, d]) => [
        k,
        { ...d, rationale: prose(d.rationale) },
      ]),
    ) as GlmEvaluationOutput["dimensions"],
    advanceRecommendation: prose(g.advanceRecommendation),
    oneLineVerdict: prose(g.oneLineVerdict),
    interviewQuestions: g.interviewQuestions.map((q) => ({
      question: prose(q.question),
      verifyHypothesis: prose(q.verifyHypothesis),
    })),
    cultivationPlan: {
      direction: prose(g.cultivationPlan.direction),
      suitableProjects: g.cultivationPlan.suitableProjects.map(prose),
      growthFocus: prose(g.cultivationPlan.growthFocus),
    },
  };
}
