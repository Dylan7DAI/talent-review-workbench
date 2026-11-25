import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseResumesMarkdown } from "../src/lib/parser";
import { computeCandidateEvaluation, recomputeBatch } from "../src/lib/scoring";
import {
  compact,
  evaluateCandidateWithGlm,
  generateBatchSummaryWithGlm,
  DEFAULT_MODEL,
  PROMPT_VERSION,
} from "../src/lib/glm";
import {
  DEFAULT_WEIGHTS,
  GlmEvaluationOutputSchema,
  type BatchSnapshot,
  type CandidateEvaluation,
} from "../src/lib/types";
import { exportBatchToMarkdown, serializeSnapshot } from "../src/lib/export";
try {
  process.loadEnvFile(".env.local");
} catch {}
async function main() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ZHIPU_API_KEY;
  if (!apiKey) throw Error("请在本地配置 API Key。");
  const model = process.env.GLM_MODEL || DEFAULT_MODEL,
    config = { model, apiKey, baseUrl: process.env.OPENAI_BASE_URL };
  const markdown = await readFile("src/data/10_ai_phd_resumes.md", "utf8"),
    { candidates } = parseResumesMarkdown(markdown);
  if (!candidates.length || candidates.length > 20)
    throw Error("批次人数必须在 1–20 之间。");
  const cache = join(
    ".cache",
    "snapshot-" +
      createHash("sha256")
        .update(PROMPT_VERSION + model + markdown)
        .digest("hex")
        .slice(0, 16),
  );
  await mkdir(cache, { recursive: true });
  const rows: CandidateEvaluation[] = [],
    errors: string[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const c = candidates[cursor++],
        file = join(cache, c.id + ".json");
      try {
        let output;
        try {
          output = GlmEvaluationOutputSchema.parse(
            JSON.parse(await readFile(file, "utf8")),
          );
          if (
            Object.values(output.dimensions).some((d) =>
              d.evidenceQuotes.some(
                (q) => !c.raw.includes(q) || !c.blindWorkEvidence.includes(q),
              ),
            )
          )
            throw Error("缓存引文与材料不一致");
        } catch {
          output = await evaluateCandidateWithGlm(c, config);
          await writeFile(file, JSON.stringify(output));
        }
        rows.push(computeCandidateEvaluation(c, output));
        console.log(c.id, "完成");
      } catch (e) {
        errors.push(c.id);
        console.error(c.id, e instanceof Error ? e.message : "失败");
      }
    }
  }
  await Promise.all([worker(), worker()]);
  if (errors.length)
    throw Error("未覆盖：" + errors.join("、") + "。保留成功条目以便重跑。");
  const evaluations = recomputeBatch(rows),
    summary = await generateBatchSummaryWithGlm(
      evaluations.map(compact),
      config,
    );
  const snapshot: BatchSnapshot = {
    version: 2,
    source: "verified",
    model,
    createdAt: new Date().toISOString(),
    markdown,
    weights: DEFAULT_WEIGHTS,
    summary,
    evaluations,
  };
  const dest = "src/data/verified-snapshot.json";
  await writeFile(dest + ".tmp", serializeSnapshot(snapshot));
  await rename(dest + ".tmp", dest);
  await mkdir("outputs", { recursive: true });
  await writeFile(
    "outputs/初评报告.md",
    exportBatchToMarkdown(evaluations, summary, DEFAULT_WEIGHTS),
  );
  console.table(
    evaluations.map((e) => ({
      排名: e.rank,
      编号: e.candidate.id,
      分层: e.tier,
      分数: e.compositeScore,
      尖峰: e.isSpiky,
      光环: e.haloContrast,
    })),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
