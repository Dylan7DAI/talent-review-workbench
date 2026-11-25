import {
  keys,
  labels,
  decisions,
  confidenceNames,
  contrasts,
  flagLabels,
  type WeightConfig,
  type CandidateEvaluation,
  type BatchSnapshot,
} from "./types";
const cell = (s: string) => s.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
export function exportBatchToMarkdown(
  rows: CandidateEvaluation[],
  summary: string,
  w: WeightConfig,
) {
  const out = [
    "# AI 人才潜力初评报告",
    "",
    "## 批次横向洞察",
    summary || "批次摘要尚未生成。",
    "",
    "权重（相对值）：" + keys.map((k) => labels[k] + " " + w[k]).join(" / "),
    "",
    "| 排名 | 编号 | 研究方向 | 分层 | 潜力分 | 置信度 |",
    "|---:|---|---|---|---:|---|",
    ...rows.map(
      (e) =>
        "| " +
        [
          e.rank,
          e.candidate.id,
          cell(e.candidate.title),
          e.tier,
          e.compositeScore,
          confidenceNames[e.confidence],
        ].join(" | ") +
        " |",
    ),
  ];
  for (const e of rows) {
    const g = e.glm;
    out.push(
      "",
      "## " + e.candidate.id + "　" + e.candidate.title,
      "",
      "### 是否建议推进",
      e.tier + " · " + decisions[e.tier] + "。" + g.oneLineVerdict,
      g.advanceRecommendation,
      "",
      "### 面谈重点追问",
      ...e.interviewQuestions.map(
        (q) => "- " + q.question + "　核验目标：" + q.verifyHypothesis,
      ),
      "",
      "### 建议培养方向",
      g.cultivationPlan.direction,
      ...g.cultivationPlan.suitableProjects.map((p) => "- " + p),
      g.cultivationPlan.growthFocus,
      "",
      "### 四维原文依据",
    );
    for (const k of keys) {
      const d = g.dimensions[k];
      out.push(
        "",
        "**" +
          labels[k] +
          "　" +
          (d.score ? d.score + "/5" : "证据不足") +
          "**",
        ...d.evidenceQuotes.map((q) => "> " + q),
        d.rationale,
      );
    }
    out.push(
      "",
      "光环对照：" +
        contrasts[e.haloContrast] +
        "。" +
        e.candidate.haloMetadata.haloSummary.join("、"),
      "待核信号：" +
        (e.redFlags.map((f) => flagLabels[f]).join("、") || "未标记"),
      ...e.candidate.parseWarnings,
    );
  }
  return out.join("\n") + "\n";
}
export function serializeSnapshot(s: BatchSnapshot) {
  return JSON.stringify(s, null, 2) + "\n";
}
