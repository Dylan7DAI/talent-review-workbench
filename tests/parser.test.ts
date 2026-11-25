import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseResumesMarkdown } from "../src/lib/parser";
const md = readFileSync("src/data/10_ai_phd_resumes.md", "utf8");
describe("解析与盲审", () => {
  it("读取十人并保留阶段与光环档案", () => {
    const { candidates: c } = parseResumesMarkdown(md);
    expect(c.map((x) => x.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
    expect(c[1].stage).toBe("联合培养博士二年级");
    expect(c[0].haloMetadata.isTopSchool).toBe(true);
    expect(c[7].haloMetadata.hasPublishedPaper).toBe(false);
  });
  it("识别 09 的重复与稀疏、01/10 的模糊词", () => {
    const c = parseResumesMarkdown(md).candidates;
    expect(c[8].precheckSignals).toMatchObject({
      isSparse: true,
      hasDuplicateSentences: true,
    });
    expect(c[0].precheckSignals.vaguePhrases.length).toBeGreaterThanOrEqual(2);
    expect(c[9].precheckSignals.vaguePhrases.length).toBeGreaterThanOrEqual(3);
  });
  it("盲审保留方法、去除学校及发表", () => {
    const c = parseResumesMarkdown(md).candidates;
    expect(c[0].blindWorkEvidence).toContain("分块选取 token");
    expect(c[0].blindWorkEvidence).toContain("4B 模型");
    for (const x of c)
      expect(x.blindWorkEvidence).not.toMatch(
        /顶尖高校|985|211|GPA|CCF[-－][AB]|互联网大厂|一作|金融机构/i,
      );
  });
  it("空、非标准、重复编号与一级标题可恢复", () => {
    for (const [input, n] of [
      ["", 0],
      ["一段经历", 1],
      ["第一份\n---\n第二份", 2],
      ["# 甲\n内容\n# 乙\n内容", 2],
    ] as const) {
      const r = parseResumesMarkdown(input);
      expect(r.candidates.length).toBe(n);
      expect(r.warnings.length).toBeGreaterThan(0);
    }
    const r = parseResumesMarkdown(
      "## 候选人 01｜甲\n工作\n## 候选人 01｜乙\n经历",
    );
    expect(new Set(r.candidates.map((c) => c.id)).size).toBe(2);
  });
});

it("标准和非标准二级标题混排不会串人", () => {
  const r = parseResumesMarkdown(
    "## 候选人 01｜甲\n**项目经历**：\n- 独立开发工具甲。\n## 匿名乙\n**工程经历**：\n- 独立维护工具乙。",
  );
  expect(r.candidates).toHaveLength(2);
  expect(r.candidates[0].blindWorkEvidence).not.toContain("工具乙");
  expect(r.candidates[1].parseWarnings.length).toBeGreaterThan(0);
});
