import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function defaultMarkdown() {
  for (const path of [
    "飞书文档/10_ai_phd_resumes.md",
    "src/data/10_ai_phd_resumes.md",
  ]) {
    try {
      return await readFile(join(process.cwd(), path), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  throw Error("找不到内置简历。");
}
