import { it, expect, vi } from "vitest";
import { POST as evaluate } from "../src/app/api/evaluate/route";
import { POST as summary } from "../src/app/api/summary/route";
import { GET } from "../src/app/api/resumes/default/route";
import { parseResumesMarkdown } from "../src/lib/parser";
import { modelConfig } from "../src/lib/server";
const req = (x: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(x),
  });
it("附件 API 可读取十人", async () =>
  expect(
    parseResumesMarkdown((await (await GET()).json()).markdown).candidates
      .length,
  ).toBe(10));
it("单人端点拒绝整批、过大输入及外站来源", async () => {
  expect(
    (
      await evaluate(
        req({
          raw: "## 候选人 01｜甲\n## 候选人 02｜乙",
          id: "01",
          apiKey: "test",
        }),
      )
    ).status,
  ).toBe(400);
  expect((await evaluate(req({ raw: "甲".repeat(34000) }))).status).toBe(413);
  const r = req({});
  r.headers.set("origin", "https://other.invalid");
  expect((await evaluate(r)).status).toBe(403);
});
it("摘要最多 20 人且不能夹带全文", async () => {
  const o = { id: "01", tier: "B", score: 61, verdict: "补证", risk: [] };
  expect((await summary(req({ items: Array(21).fill(o) }))).status).toBe(400);
  expect(
    (await summary(req({ items: [{ ...o, raw: "私密原文" }] }))).status,
  ).toBe(400);
});
it("生产环境限定 BYOK，环境密钥不作为回退", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OPENAI_API_KEY", "local-test");
  try {
    expect(() => modelConfig({ model: "test" }, req({}))).toThrow("API Key");
    expect(
      modelConfig({ model: "test", apiKey: "my-test" }, req({})).apiKey,
    ).toBe("my-test");
  } finally {
    vi.unstubAllEnvs();
  }
});

it("保留浏览器的回环地址，兼容 Next 规范化后的 localhost", async () => {
  const r = req({});
  r.headers.set("host", "127.0.0.1");
  r.headers.set("origin", "http://127.0.0.1");
  expect((await evaluate(r)).status).toBe(400);
});

it("开发环境只允许回环主机使用本地密钥", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("OPENAI_API_KEY", "local-test");
  try {
    const r = req({});
    expect(modelConfig({ model: "test" }, r).apiKey).toBe("local-test");
    r.headers.set("host", "review.example");
    expect(() => modelConfig({ model: "test" }, r)).toThrow("API Key");
  } finally {
    vi.unstubAllEnvs();
  }
});
