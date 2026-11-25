import { readableAssessment } from "./evidence";
import {
  keys,
  tiers,
  DEFAULT_WEIGHTS,
  type WeightConfig,
  type DimensionKey,
  type ParsedCandidate,
  type CandidateEvaluation,
  type GlmEvaluationOutput,
  type RedFlagCode,
} from "./types";
function average(
  ks: readonly DimensionKey[],
  out: GlmEvaluationOutput,
  weights: WeightConfig,
  missing: number,
) {
  const valid = ks.filter((k) => out.dimensions[k].score > 0);
  if (!valid.length) return missing;
  const clean = (k: DimensionKey) =>
    Number.isFinite(weights[k]) ? Math.max(0, weights[k]) : 0;
  const total = valid.reduce((s, k) => s + clean(k), 0);
  const get = total > 0 ? clean : (k: DimensionKey) => DEFAULT_WEIGHTS[k];
  return (
    valid.reduce((s, k) => s + get(k) * out.dimensions[k].score, 0) /
    valid.reduce((s, k) => s + get(k), 0)
  );
}
const haloQuestion = {
  question:
    "请展示一次由你独立作出技术取舍的记录，标出团队基线、你的改动与验证结果。",
  verifyHypothesis: "核实个人贡献能否脱离团队与发表标签独立复现。",
};
export function computeCandidateEvaluation(
  candidate: ParsedCandidate,
  glm: GlmEvaluationOutput,
  weights: WeightConfig = DEFAULT_WEIGHTS,
): CandidateEvaluation {
  glm = readableAssessment(candidate, glm);
  const valid = keys.filter((k) => glm.dimensions[k].score > 0);
  const uniqueQuotes = new Set(
    valid.flatMap((k) => glm.dimensions[k].evidenceQuotes),
  );
  const redFlags: RedFlagCode[] = [
    ...new Set([
      // Sparsity is measured during parsing. Keep the model's original flags
      // in the assessment for auditing, but use the measured flag for decisions.
      ...glm.redFlags.filter((flag) => flag !== "SPARSE_RESUME"),
      ...(candidate.precheckSignals.isSparse ? ["SPARSE_RESUME" as const] : []),
      ...(candidate.precheckSignals.vaguePhrases.length >= 2
        ? ["VAGUE_METRICS" as const]
        : []),
    ]),
  ];
  const confidence =
    valid.length <= 2 || redFlags.includes("SPARSE_RESUME")
      ? "low"
      : valid.length === 3 ||
          uniqueQuotes.size < 2 ||
          redFlags.includes("VAGUE_METRICS")
        ? "medium"
        : "high";
  const compositeScore = Math.min(
    valid.length < 2 ? 65 : 100,
    Math.round(average(keys, glm, weights, 0) * 20),
  );
  const spikyDimension =
      keys.find((k) => glm.dimensions[k].score === 5) ?? null,
    isSpiky = !!spikyDimension;
  const h = candidate.haloMetadata,
    high =
      h.isTopSchool ||
      h.ccfAPublished > 0 ||
      h.ccfAUnderReview >= 2 ||
      h.hasBigTechInternship;
  const haloContrast =
    high && (compositeScore < 72 || redFlags.includes("VAGUE_METRICS"))
      ? "HALO_EVIDENCE_GAP"
      : !high && (compositeScore >= 76 || isSpiky)
        ? "HIDDEN_GEM"
        : "ALIGNED";
  const tier =
    valid.length < 2 || redFlags.includes("SPARSE_RESUME")
      ? "B"
      : confidence !== "low" && compositeScore >= 80
        ? "S"
        : (confidence !== "low" && compositeScore >= 70) ||
            (isSpiky && compositeScore >= 60)
          ? "A+"
          : confidence === "low" ||
              haloContrast === "HALO_EVIDENCE_GAP" ||
              compositeScore >= 65
            ? "B"
            : "C";
  const questions = [...glm.interviewQuestions];
  if (
    haloContrast === "HALO_EVIDENCE_GAP" &&
    !questions.some((q) => q.question === haloQuestion.question)
  )
    questions.push(haloQuestion);
  return {
    candidate,
    glm,
    tier,
    compositeScore,
    confidence,
    redFlags,
    isSpiky,
    spikyDimension,
    haloContrast,
    interviewQuestions: questions,
    researchTasteX: +average(keys.slice(0, 2), glm, weights, 2.5).toFixed(2),
    executionLoopY: +average(keys.slice(2), glm, weights, 2.5).toFixed(2),
    rank: 0,
  };
}
export function recomputeBatch(
  evaluations: CandidateEvaluation[],
  weights: WeightConfig = DEFAULT_WEIGHTS,
) {
  return evaluations
    .map((e) => computeCandidateEvaluation(e.candidate, e.glm, weights))
    .sort(
      (a, b) =>
        tiers.indexOf(a.tier) - tiers.indexOf(b.tier) ||
        b.compositeScore - a.compositeScore ||
        a.candidate.id.localeCompare(b.candidate.id, undefined, {
          numeric: true,
        }),
    )
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
