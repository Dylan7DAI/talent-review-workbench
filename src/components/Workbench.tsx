"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import TopControlBar, { type Tab } from "./TopControlBar";
import BatchOverview from "./BatchOverview";
import CandidateDossier from "./CandidateDossier";
import { parseResumesMarkdown } from "../lib/parser";
import { recomputeBatch } from "../lib/scoring";
import {
  DEFAULT_WEIGHTS,
  keys,
  type BatchSnapshot,
  type CandidateEvaluation,
  type ParsedCandidate,
  type WeightConfig,
} from "../lib/types";
import { CACHE_KEY, pool, restoreSnapshot, type Job } from "../lib/batch";
import { exportBatchToMarkdown, serializeSnapshot } from "../lib/export";
async function post<T>(path: string, data: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await r.json().catch(() => ({ error: "服务没有返回 JSON。" }));
  if (!r.ok) throw Error(json.error || "服务请求失败。");
  return json as T;
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Workbench({
  builtin,
  verified,
}: {
  builtin: string;
  verified: BatchSnapshot | null;
}) {
  const [md, setMd] = useState(verified?.markdown || builtin),
    [name, setName] = useState("题目附件"),
    [rows, setRows] = useState<CandidateEvaluation[]>(
      verified?.evaluations || [],
    ),
    [weights, setWeights] = useState<WeightConfig>(DEFAULT_WEIGHTS),
    [summary, setSummary] = useState(verified?.summary || ""),
    [basis, setBasis] = useState<WeightConfig>(DEFAULT_WEIGHTS);
  const [mode, setMode] = useState<"live" | "verified">(
      verified ? "verified" : "live",
    ),
    [runModel, setRunModel] = useState(verified?.model || ""),
    [date, setDate] = useState(verified?.createdAt || ""),
    [model, setModel] = useState(verified?.model || "glm-4.5"),
    [keyValue, setKey] = useState("");
  const [tab, setTab] = useState<Tab>("overview"),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [jobs, setJobs] = useState<Record<string, Job>>({}),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(0);
  const lock = useRef(false);
  const parsed = useMemo(() => parseResumesMarkdown(md), [md]);
  const sorted = useMemo(() => recomputeBatch(rows, weights), [rows, weights]);
  const setJob = (id: string, j: Job) =>
    setJobs((prev) => ({ ...prev, [id]: j }));
  function load(s: BatchSnapshot, label: string) {
    setMd(s.markdown);
    setName(label);
    setRows(s.evaluations);
    setWeights(s.weights);
    setBasis(s.weights);
    setSummary(s.summary);
    setRunModel(s.model);
    setModel(s.model);
    setMode(s.source);
    setDate(s.createdAt);
    setId("");
    setJobs(
      Object.fromEntries(
        parseResumesMarkdown(s.markdown)
          .candidates.filter(
            (c) => !s.evaluations.some((e) => e.candidate.id === c.id),
          )
          .map((c) => [c.id, { state: "error", ms: 0, error: "上次未完成。" }]),
      ),
    );
    setMessage("");
    setTab("overview");
  }
  useEffect(() => {
    try {
      const txt = localStorage.getItem(CACHE_KEY);
      if (txt) {
        const s = restoreSnapshot(JSON.parse(txt));
        if (
          s?.source === "verified" &&
          verified &&
          s.createdAt !== verified.createdAt
        ) {
          load(verified, "题目附件");
          save(verified);
        } else if (s) {
          load(s, "本地缓存");
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [busy]);
  function save(s: BatchSnapshot) {
    try {
      localStorage.setItem(CACHE_KEY, serializeSnapshot(s));
    } catch {
      setMessage((v) => v + " 本地缓存空间不足，可导出 JSON。");
    }
  }
  function apply(text: string, label: string) {
    if (new TextEncoder().encode(text).length > 100000)
      throw Error("输入超过 100 KB。");
    const p = parseResumesMarkdown(text);
    if (!p.candidates.length || p.candidates.length > 20)
      throw Error("每批需包含 1–20 份简历。");
    setMd(text);
    setName(label);
    setRows([]);
    setSummary("");
    setJobs({});
    setDate("");
    setRunModel("");
    setMode("live");
    setTab("overview");
    setMessage(
      p.warnings.length
        ? "已解析，部分材料需要核对。"
        : "已就绪，可运行全量初评。",
    );
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }
  function select(value: string) {
    setId(value);
    setTab("dossier");
    window.scrollTo(0, 0);
  }
  function persist(
    list: CandidateEvaluation[],
    insight: string,
    stamp: string,
    usedModel: string,
  ) {
    save({
      version: 2,
      source: "live",
      createdAt: stamp,
      markdown: md,
      model: usedModel,
      weights: { ...weights },
      summary: insight,
      evaluations: recomputeBatch(list, weights),
    });
  }
  async function getSummary(list: CandidateEvaluation[], usedModel: string) {
    const result = await post<{ summary: string }>("summary", {
      apiKey: keyValue,
      model: usedModel,
      items: recomputeBatch(list, weights).map((e) => ({
        id: e.candidate.id,
        tier: e.tier,
        score: e.compositeScore,
        verdict: e.glm.oneLineVerdict,
        risk: e.redFlags,
      })),
    });
    return result.summary;
  }
  async function evaluate(only?: string) {
    if (lock.current) return;
    if (!/^[a-zA-Z0-9_.-]{1,90}$/.test(model)) {
      setMessage("请先设置有效的模型名称。");
      return;
    }
    if (only && runModel && runModel !== model) {
      setMessage("单人重试需使用本批原模型，或选择全量重跑。");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTab("overview");
    setMode("live");
    setRunModel(model);
    setSummary("");
    const todo = only
      ? parsed.candidates.filter((c) => c.id === only)
      : parsed.candidates;
    const list = only ? rows.filter((e) => e.candidate.id !== only) : [];
    setRows([...list]);
    if (!only) setJobs({});
    const startedAt = new Date().toISOString();
    persist(list, "", startedAt, model);
    let failures = 0;
    try {
      await pool(todo, async (c: ParsedCandidate) => {
        const start = Date.now();
        setJob(c.id, { state: "running", start, ms: 0 });
        try {
          const { evaluation } = await post<{
            evaluation: CandidateEvaluation;
          }>("evaluate", {
            raw: c.raw,
            id: c.id,
            model,
            apiKey: keyValue,
            weights,
          });
          evaluation.candidate = c;
          list.push(evaluation);
          setRows([...list]);
          persist(list, "", startedAt, model);
          setJob(c.id, { state: "done", ms: Date.now() - start });
        } catch (e) {
          failures++;
          setJob(c.id, {
            state: "error",
            ms: Date.now() - start,
            error: (e as Error).message,
          });
        }
      });
      const stamp = new Date().toISOString();
      let insight = "";
      setDate(stamp);
      setBasis({ ...weights });
      if (list.length) {
        try {
          insight = await getSummary(list, model);
          setSummary(insight);
        } catch (e) {
          setMessage("候选人结果已保留。批次洞察：" + (e as Error).message);
        }
      }
      if (failures)
        setMessage(
          (v) => v + " " + failures + " 份未完成，可在表格中单独重试。",
        );
      persist(list, insight, stamp, model);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function regenerate() {
    if (lock.current || !rows.length) return;
    lock.current = true;
    setBusy(true);
    try {
      const insight = await getSummary(rows, runModel || model);
      setSummary(insight);
      setBasis({ ...weights });
      const stamp = new Date().toISOString();
      setMode("live");
      setDate(stamp);
      persist(rows, insight, stamp, runModel || model);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const changed = keys.some((k) => basis[k] !== weights[k]);
  const insightLabel =
    (changed ? "运行时权重" : "本轮权重") +
    " · 已评 " +
    rows.length +
    " / " +
    parsed.candidates.length +
    " 人";
  function exportFile(type: "md" | "json") {
    const snap: BatchSnapshot = {
      version: 2,
      source: mode,
      markdown: md,
      model: runModel,
      createdAt: date || new Date().toISOString(),
      weights,
      summary: changed ? "" : summary,
      evaluations: sorted,
    };
    if (type === "json")
      download(
        serializeSnapshot(snap),
        "研判-批次快照.json",
        "application/json",
      );
    else
      download(
        exportBatchToMarkdown(
          sorted,
          (changed ? "【洞察沿用运行时权重】" : "") + summary,
          weights,
        ) +
          "\n覆盖 " +
          rows.length +
          " / " +
          parsed.candidates.length +
          " 人。\n",
        "研判-初评报告.md",
        "text/markdown;charset=utf-8",
      );
  }
  return (
    <>
      <TopControlBar
        tab={tab}
        setTab={setTab}
        busy={busy}
        model={model}
        setModel={setModel}
        keyValue={keyValue}
        setKey={setKey}
        apply={apply}
        builtin={builtin}
        canLoad={!!verified}
        load={() => {
          if (verified) {
            load(verified, "题目附件");
            save(verified);
          }
        }}
        run={() => void evaluate()}
        exportFile={exportFile}
        haveRows={!!rows.length}
      />
      <main>
        <div className="intro">
          <div>
            <h1>{tab === "overview" ? "人才潜力初评" : "候选人深度评审"}</h1>
            <p>
              {name}　/　{parsed.candidates.length} 份简历　/　
              {runModel || model}
            </p>
          </div>
          <div className="source">
            <i />
            {busy
              ? "正在运行"
              : mode === "verified"
                ? "GLM 实测快照"
                : rows.length
                  ? "实时初评结果"
                  : "等待初评"}
            {date && <small>{date.slice(0, 10)}</small>}
            {verified && !busy && mode !== "verified" && (
              <button
                onClick={() => {
                  load(verified, "题目附件");
                  save(verified);
                }}
              >
                加载实测快照
              </button>
            )}
          </div>
        </div>
        {busy && (
          <div className="progress" role="status">
            <progress
              value={
                rows.length +
                Object.values(jobs).filter((j) => j.state === "error").length
              }
              max={parsed.candidates.length}
            />{" "}
            已评 {rows.length} / {parsed.candidates.length} 人
          </div>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {tab === "overview" ? (
          <BatchOverview
            rows={sorted}
            candidates={parsed.candidates}
            weights={weights}
            setWeights={(w) => {
              if (!busy) setWeights(w);
            }}
            summary={summary}
            insightLabel={insightLabel}
            changedWeights={changed}
            jobs={jobs}
            select={select}
            retry={(v) => void evaluate(v)}
            regenerate={() => void regenerate()}
            busy={busy}
            now={now}
          />
        ) : (
          <CandidateDossier rows={sorted} id={id} select={select} />
        )}
        {parsed.warnings.length > 0 && (
          <details className="parsewarn">
            <summary>解析记录 · {parsed.warnings.length} 条</summary>
            {parsed.warnings.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </details>
        )}
      </main>
    </>
  );
}
