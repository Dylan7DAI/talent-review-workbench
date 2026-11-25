import { z } from "zod";
export const keys = [
  "attribution",
  "problem_formulation",
  "engineering_velocity",
  "data_scaling",
] as const;
export type DimensionKey = (typeof keys)[number];
export const labels: Record<DimensionKey, string> = {
  attribution: "归因与研究品味",
  problem_formulation: "独立问题定义",
  engineering_velocity: "工程与实验迭代",
  data_scaling: "数据与 Scaling 直觉",
};
export const flagLabels = {
  VAGUE_METRICS: "指标模糊",
  PERIPHERAL_ROLE: "贡献边界待核",
  SCATTERED_FOCUS: "方向分散",
  SPARSE_RESUME: "材料稀疏",
};
export const flags = [
  "VAGUE_METRICS",
  "PERIPHERAL_ROLE",
  "SCATTERED_FOCUS",
  "SPARSE_RESUME",
] as const;
export type RedFlagCode = (typeof flags)[number];
export const tiers = ["S", "A+", "B", "C"] as const;
export type Tier = (typeof tiers)[number];
export const decisions: Record<Tier, string> = {
  S: "强烈推荐推进",
  "A+": "建议推进",
  B: "补问后定",
  C: "暂缓推进",
};
export type ConfidenceLevel = "high" | "medium" | "low";
export const confidenceNames = { high: "高", medium: "中", low: "低" };
export type HaloContrastType = "HALO_EVIDENCE_GAP" | "HIDDEN_GEM" | "ALIGNED";
export const contrasts = {
  HALO_EVIDENCE_GAP: "光环与实证有差距",
  HIDDEN_GEM: "逆光环高潜",
  ALIGNED: "无明显反差",
};
export const DEFAULT_WEIGHTS = {
  attribution: 30,
  problem_formulation: 25,
  engineering_velocity: 25,
  data_scaling: 20,
};
export type WeightConfig = Record<DimensionKey, number>;
export const weightSchema = z.object({
  attribution: z.number().min(0).max(100),
  problem_formulation: z.number().min(0).max(100),
  engineering_velocity: z.number().min(0).max(100),
  data_scaling: z.number().min(0).max(100),
});
export interface HaloMetadata {
  schoolTier: string;
  isTopSchool: boolean;
  gpa: string;
  ccfAPublished: number;
  ccfAUnderReview: number;
  otherPublished: number;
  hasPublishedPaper: boolean;
  noPublishedPaper: boolean;
  hasBigTechInternship: boolean;
  haloSummary: string[];
}
export interface PrecheckSignals {
  workCharCount: number;
  isSparse: boolean;
  hasDuplicateSentences: boolean;
  vaguePhrases: string[];
}
export interface ParsedCandidate {
  id: string;
  title: string;
  stage: string;
  direction: string;
  skills?: string;
  raw: string;
  blindWorkEvidence: string;
  haloMetadata: HaloMetadata;
  precheckSignals: PrecheckSignals;
  parseWarnings: string[];
}
const phrase = z.string().trim().min(1).max(700);
export const GlmDimensionAssessmentSchema = z
  .object({
    evidenceQuotes: z.array(phrase).max(3),
    score: z.number().int().min(0).max(5),
    rationale: phrase,
  })
  .refine(
    (v) =>
      v.score === 0
        ? v.evidenceQuotes.length === 0
        : v.evidenceQuotes.length > 0,
    { message: "有分必须逐字引用，缺证为零且引文为空" },
  );
export const GlmEvaluationOutputSchema = z.object({
  dimensions: z.object({
    attribution: GlmDimensionAssessmentSchema,
    problem_formulation: GlmDimensionAssessmentSchema,
    engineering_velocity: GlmDimensionAssessmentSchema,
    data_scaling: GlmDimensionAssessmentSchema,
  }),
  redFlags: z.array(z.enum(flags)).max(4),
  advanceRecommendation: phrase,
  interviewQuestions: z
    .array(z.object({ question: phrase, verifyHypothesis: phrase }))
    .min(2)
    .max(5),
  cultivationPlan: z.object({
    direction: phrase,
    suitableProjects: z.array(phrase).min(1).max(3),
    growthFocus: phrase,
  }),
  oneLineVerdict: phrase,
});
export type GlmEvaluationOutput = z.infer<typeof GlmEvaluationOutputSchema>;
export interface CandidateEvaluation {
  candidate: ParsedCandidate;
  glm: GlmEvaluationOutput;
  compositeScore: number;
  tier: Tier;
  confidence: ConfidenceLevel;
  isSpiky: boolean;
  spikyDimension: DimensionKey | null;
  haloContrast: HaloContrastType;
  redFlags: RedFlagCode[];
  interviewQuestions: GlmEvaluationOutput["interviewQuestions"];
  researchTasteX: number;
  executionLoopY: number;
  rank: number;
}
export interface BatchSnapshot {
  version: 2;
  source: "live" | "verified";
  model: string;
  createdAt: string;
  markdown: string;
  weights: WeightConfig;
  summary: string;
  evaluations: CandidateEvaluation[];
}
