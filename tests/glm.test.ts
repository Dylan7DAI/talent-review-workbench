import { it, expect, vi } from "vitest";
import {
  buildBlindEvaluationMessages,
  parseGlmJsonResponse,
  evaluateCandidateWithGlm,
  generateBatchSummaryWithGlm,
} from "../src/lib/glm";
import { candidates, response } from "./fixture";
const config = { model: "glm-4-flash", apiKey: "test-only" };
const answer = (s: string) =>
  Response.json({ choices: [{ message: { content: s } }] });
it("送出消息无学校、GPA、CCF 或雇主光环", () => {
  for (const c of candidates) {
    const msg = JSON.stringify(buildBlindEvaluationMessages(c));
    expect(msg).not.toMatch(
      /985|211|某顶尖高校|GPA|CCF-A|CCF-B|某互联网大厂|某金融机构|haloMetadata/,
    );
  }
});
it("剥离围栏并拒绝越界分数", () => {
  const g = response();
  expect(
    parseGlmJsonResponse(["```json", JSON.stringify(g), "```"].join("\n")),
  ).toEqual(g);
  g.dimensions.attribution.score = 6;
  expect(() => parseGlmJsonResponse(JSON.stringify(g))).toThrow();
});
it("一次修复并将编号映射为本人原文", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(answer("bad"))
    .mockResolvedValueOnce(answer(JSON.stringify(response())));
  const g = await evaluateCandidateWithGlm(candidates[1], config, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(fetcher.mock.calls[1][1].body).messages.at(-1).content,
  ).toContain("JSON");
  expect(candidates[1].raw).toContain(
    g.dimensions.attribution.evidenceQuotes[0],
  );
});
it("两个错引均拒绝，错误隔离在单人", async () => {
  const fetcher = vi.fn(async () =>
    answer(JSON.stringify(response("完全虚构的引文"))),
  );
  await expect(
    evaluateCandidateWithGlm(candidates[0], config, fetcher),
  ).rejects.toThrow("引文");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("模型不支持 response_format 时移除参数，429 重试一次", async () => {
  for (const a of [
    Response.json(
      { error: { message: "unsupported response_format" } },
      { status: 400 },
    ),
    Response.json({ error: { code: "1302" } }, { status: 429 }),
  ]) {
    const f = vi
      .fn()
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(answer(JSON.stringify(response())));
    await evaluateCandidateWithGlm(candidates[0], config, f);
    expect(f).toHaveBeenCalledTimes(2);
    if (a.status === 400)
      expect(JSON.parse(f.mock.calls[1][1].body)).not.toHaveProperty(
        "response_format",
      );
  }
});
it("认证失败不重试，摘要只接受规定长度", async () => {
  const f = vi.fn(async () => new Response(null, { status: 401 }));
  await expect(
    evaluateCandidateWithGlm(candidates[0], config, f),
  ).rejects.toThrow("401");
  expect(f).toHaveBeenCalledTimes(1);
  const good = "甲".repeat(160);
  const h = vi
    .fn()
    .mockResolvedValueOnce(answer('{"summary":"短"}'))
    .mockResolvedValueOnce(answer(JSON.stringify({ summary: good })));
  expect(await generateBatchSummaryWithGlm([], config, h)).toBe(good);
});
