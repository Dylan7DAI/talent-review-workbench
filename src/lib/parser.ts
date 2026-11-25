import type { HaloMetadata, ParsedCandidate } from "./types";
const fieldNames = [
  "研究方向",
  "当前阶段",
  "求职意向",
  "教育背景",
  "代表成果",
  "技能关键词",
  "实习经历",
  "科研经历",
  "项目经历",
  "工程经历",
  "开源",
];
const workSections = new Set([
  "实习经历",
  "科研经历",
  "项目经历",
  "工程经历",
  "开源",
]);
const named = /^#{1,3}\s*候选人\s*(\d+)(?:\s*[｜|：:\-—]\s*(.*))?\s*$/u;
const strip = (s: string) =>
  s
    .replace(/^\s*(?:[-+*]\s+|\d+[.)、]\s+)/, "")
    .replace(/\*\*|__/g, "")
    .trim();
const school =
  /清华大学|北京大学|斯坦福大学|麻省理工学院|(?:[\u4e00-\u9fff]{2,12})(?:大学|学院)|某(?:顶尖|普通本科|普通|重点)?高校|(?:某\s*)?(?:985|211|双一流)\s*(?:高校|院校|大学)?/gi;
const badge =
  /\bGPA\s*[:：]?\s*[\d.]+(?:\s*\/\s*[\d.]+)?|CCF[\s\-－—]*[ABC](?:\s*类(?:会议|期刊)?)?|专业排名前\s*[\d.]+%|某(?:互联网大厂|金融机构|AI 公司|文档智能公司|研究院|内容平台)|(?:字节跳动|阿里巴巴|腾讯|百度|华为|微软|谷歌|Meta|OpenAI)(?:公司|研究院)?|(?:顶会|名校|大厂)/gi;
export function redactHaloFromText(s: string) {
  return s
    .replace(school, "〔隐去〕")
    .replace(badge, "〔隐去〕")
    .replace(
      /(?:共同)?第[一二三]作者|[一二三]作(?:者)?|在审|已发表|已录用/g,
      "〔隐去〕",
    );
}
function halo(raw: string): HaloMetadata {
  const schoolTier = /顶尖高校|清华大学|北京大学/.test(raw)
    ? "top"
    : /985/.test(raw)
      ? "985"
      : /211/.test(raw)
        ? "211"
        : /高校|大学|院校/.test(raw)
          ? "regular"
          : "unknown";
  const gpa = raw.match(/GPA\s*[:：]?\s*[\d.]+(?:\/[\d.]+)?/i)?.[0] || "";
  const lines = raw.split("\n"),
    published = lines.filter((s) => /已发表|已录用/.test(s));
  const ccfAPublished = published.filter((s) => /CCF[\s-]*A/i.test(s)).length;
  const ccfAUnderReview = lines.filter(
    (s) => /CCF[\s-]*A/i.test(s) && /在审/.test(s),
  ).length;
  const otherPublished = published.length - ccfAPublished,
    noPublishedPaper = /无正式发表|无已发表|暂无.*发表/.test(raw);
  const hasBigTechInternship =
    /互联网大厂|字节跳动|阿里巴巴|腾讯|百度|华为|微软|谷歌/.test(raw);
  const haloSummary = [
    schoolTier !== "unknown"
      ? schoolTier === "top"
        ? "顶尖高校"
        : schoolTier === "regular"
          ? "普通高校"
          : schoolTier + " 高校"
      : "",
    gpa,
    ccfAUnderReview ? "CCF-A 在审 " + ccfAUnderReview + " 篇" : "",
    ccfAPublished ? "CCF-A 已发表 " + ccfAPublished + " 篇" : "",
    otherPublished ? "其他已发表 " + otherPublished + " 篇" : "",
    noPublishedPaper ? "无正式发表论文" : "",
    hasBigTechInternship ? "大型科技机构经历" : "",
  ].filter(Boolean);
  return {
    schoolTier,
    isTopSchool: schoolTier === "top",
    gpa,
    ccfAPublished,
    ccfAUnderReview,
    otherPublished,
    noPublishedPaper,
    hasPublishedPaper: published.length > 0,
    hasBigTechInternship,
    haloSummary,
  };
}
function normalized(s: string) {
  return s.replace(/[^\p{L}\p{N}]/gu, "");
}
export function parseResumesMarkdown(markdown: string): {
  candidates: ParsedCandidate[];
  warnings: string[];
} {
  const lines = markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const warnings: string[] = [];
  if (!markdown.trim())
    return { candidates: [], warnings: ["输入为空，请上传或粘贴简历。"] };
  let starts = lines.flatMap((l, i) => (named.test(l.trim()) ? [i] : []));
  const standard = starts.length > 0;
  if (standard) {
    const first = starts[0];
    starts = lines.flatMap((line, i) => {
      const text = line.trim(),
        other = text.match(/^##\s+(.+)$/);
      const sub = other?.[1].replace(/(?:[：:]|\*\*)/g, "").trim() || "";
      return named.test(text) ||
        (i >= first && other && !fieldNames.includes(sub))
        ? [i]
        : [];
    });
  }
  if (!standard) {
    warnings.push("未找到标准候选人标题，已按 Markdown 结构恢复。");
    for (const re of [/^##\s+/, /^#\s+/]) {
      starts = lines.flatMap((l, i) => (re.test(l.trim()) ? [i] : []));
      if (starts.length > 1) break;
      if (lines.some((l) => /^---+$/.test(l.trim()))) {
        starts = [];
        break;
      }
      if (starts.length) break;
    }
  }
  const blocks = starts.length
    ? starts.map((start, i) =>
        lines.slice(start, starts[i + 1] ?? lines.length).join("\n"),
      )
    : lines.join("\n").split(/^\s*-{3,}[ \t]*$/m);
  const ids = new Set<string>();
  const candidates: ParsedCandidate[] = [];
  for (const block of blocks) {
    const raw = block
      .trim()
      .replace(/\n\s*---+\s*$/, "")
      .trim();
    if (!raw) continue;
    const parts = raw.split("\n"),
      header = parts[0].trim(),
      m = header.match(named),
      heading = /^#{1,3}\s/.test(header);
    let id = m
      ? String(Number(m[1])).padStart(2, "0")
      : String(candidates.length + 1).padStart(2, "0");
    const messages = standard && m ? [] : ["使用回退解析，请核对原文。"];
    if (ids.has(id)) {
      const original = id;
      let suffix = 2;
      while (ids.has(original + "-" + suffix)) suffix++;
      id = original + "-" + suffix;
      messages.push("重复编号，已分配临时编号 " + id);
    }
    ids.add(id);
    const title =
      m?.[2] || (heading && !m ? header.replace(/^#+\s*/, "") : "方向待核对");
    const fields: Record<string, string[]> = {};
    const loose: string[] = [];
    let section = "";
    for (const line of parts.slice(heading ? 1 : 0)) {
      const s = strip(line).replace(/^#{1,6}\s*/, "");
      if (!s || /^---+$/.test(s)) continue;
      const f = s.match(/^([^：:]{2,12})[：:]\s*(.*)$/);
      if (f && fieldNames.includes(f[1])) {
        section = f[1];
        fields[section] ??= [];
        if (f[2]) fields[section].push(f[2]);
        continue;
      }
      if (fieldNames.includes(s)) {
        section = s;
        fields[s] ??= [];
        continue;
      }
      if (section) (fields[section] ??= []).push(s);
      else loose.push(s);
    }
    const work = Object.entries(fields)
      .filter(([k]) => workSections.has(k))
      .flatMap(([, v]) => v);
    if (!work.length && loose.length) {
      messages.push("未找到标准实践栏目，已提取自由文本。");
      work.push(
        ...loose.filter(
          (s) =>
            !/(?:GPA|教育背景|专业排名|在审|已发表|毕业于|获得.*学位)/i.test(s),
        ),
      );
    }
    if (!work.length) messages.push("缺少可核查的工作经历。");
    const stage = redactHaloFromText(
      fields["当前阶段"]?.join(" ") || "阶段未注明",
    );
    const direction = redactHaloFromText(
      fields["研究方向"]?.join(" ") || title,
    );
    const evidence = work.map(redactHaloFromText).join("\n");
    const norms = work
      .flatMap((l) => l.split(/[。；;]/))
      .map(normalized)
      .filter((s) => s.length >= 8);
    const hasDuplicateSentences = norms.some((a, i) =>
      norms.slice(i + 1).some((b) => a.includes(b) || b.includes(a)),
    );
    const workCharCount = Array.from(
      (evidence + (fields["研究方向"]?.join("") || "")).replace(/\s/g, ""),
    ).length;
    const vaguePhrases = [
      ...new Set(
        evidence.match(
          /提升数倍|稳定提升|明显下降|有所提升|基本保持|探索新的|几乎不变|明显提升|显著改善/g,
        ) || [],
      ),
    ];
    const precheckSignals = {
      workCharCount,
      isSparse: workCharCount < 160,
      hasDuplicateSentences,
      vaguePhrases,
    };
    if (hasDuplicateSentences)
      messages.push("跨项目或栏目出现相同表述，按一次贡献核对。");
    candidates.push({
      id,
      title,
      stage,
      direction,
      skills: redactHaloFromText(fields["技能关键词"]?.join(" ") || ""),
      raw,
      blindWorkEvidence: evidence,
      haloMetadata: halo(raw),
      precheckSignals,
      parseWarnings: messages,
    });
    warnings.push(...messages.map((s) => "候选人 " + id + "：" + s));
  }
  return { candidates, warnings };
}
