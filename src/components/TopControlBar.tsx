"use client";
import { useEffect, useRef, useState } from "react";
import { barsPrompt, summaryPrompt } from "../lib/prompts";
import {
  BookOpen,
  ChartScatter,
  Download,
  FileInput,
  Settings2,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
export type Tab = "overview" | "dossier";
interface Props {
  tab: Tab;
  setTab: (v: Tab) => void;
  busy: boolean;
  keyValue: string;
  setKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  apply: (text: string, label: string) => void;
  builtin: string;
  load: () => void;
  canLoad: boolean;
  run: () => void;
  exportFile: (type: "md" | "json") => void;
  haveRows: boolean;
}
export default function TopControlBar(p: Props) {
  const [panel, setPanel] = useState<"data" | "model" | "export" | null>(null),
    [paste, setPaste] = useState(""),
    [err, setErr] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (panel) {
      setErr("");
      ref.current?.showModal();
    } else ref.current?.close();
  }, [panel]);
  function apply(md: string, n: string) {
    try {
      p.apply(md, n);
      setPanel(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <>
      <header className="chrome top">
        <div className="topinner">
          <div className="brand">
            <BookOpen size={23} strokeWidth={1.6} />
            研判
          </div>
          <nav className="switch chrome" aria-label="评审视图">
            {(
              [
                ["overview", "总览与象限", ChartScatter],
                ["dossier", "深度评审台", BookOpen],
              ] as const
            ).map(([id, name, Icon]) => (
              <button
                key={id}
                aria-pressed={p.tab === id}
                onClick={() => p.setTab(id)}
              >
                <Icon size={15} />
                {name}
              </button>
            ))}
          </nav>
          <div className="topactions">
            <button disabled={p.busy} onClick={() => setPanel("data")}>
              <FileInput />
              数据源
            </button>
            <button disabled={p.busy} onClick={() => setPanel("model")}>
              <Settings2 />
              模型
            </button>
            <button
              disabled={!p.haveRows || p.busy}
              onClick={() => setPanel("export")}
            >
              <Download />
              导出
            </button>
            <button className="primary" disabled={p.busy} onClick={p.run}>
              <Play />
              {p.busy ? "初评进行中" : "运行全量初评"}
            </button>
          </div>
        </div>
      </header>
      <dialog
        ref={ref}
        onCancel={() => setPanel(null)}
        onClose={(e) => {
          if (!e.currentTarget.open) setPanel(null);
        }}
        className="chrome pop"
      >
        <div className="pophead">
          <h2>
            {panel === "data"
              ? "简历数据源"
              : panel === "model"
                ? "模型设置"
                : panel === "export"
                  ? "导出本批评审"
                  : ""}
          </h2>
          <button aria-label="关闭" onClick={() => setPanel(null)}>
            <X />
          </button>
        </div>
        {panel === "data" && (
          <>
            <div className="stack">
              <button onClick={() => apply(p.builtin, "题目附件")}>
                读取内置 10 份简历
              </button>
              <button
                disabled={!p.canLoad}
                onClick={() => {
                  p.load();
                  setPanel(null);
                }}
              >
                <RotateCcw />
                加载实测快照
              </button>
            </div>
            <label>
              上传 Markdown
              <input
                type="file"
                accept=".md,.markdown,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 100000) throw Error("文件超过 100 KB。");
                    apply(
                      new TextDecoder("utf-8", { fatal: true }).decode(
                        await f.arrayBuffer(),
                      ),
                      f.name,
                    );
                  } catch {
                    setErr("请选择 100 KB 内的 UTF-8 Markdown。");
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <label>
              粘贴简历
              <textarea
                rows={5}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="## 候选人 01｜研究方向"
              />
            </label>
            <button
              className="primary"
              onClick={() => apply(paste, "粘贴的简历")}
            >
              解析粘贴内容
            </button>
          </>
        )}
        {panel === "model" && (
          <>
            <label>
              智谱 API Key
              <input
                type="password"
                autoComplete="off"
                value={p.keyValue}
                onChange={(e) => p.setKey(e.target.value)}
                placeholder="本地开发可使用环境变量"
              />
            </label>
            <label>
              模型名称
              <input
                list="models"
                value={p.model}
                onChange={(e) => p.setModel(e.target.value)}
              />
              <datalist id="models">
                {["glm-4-flash", "glm-4-plus", "glm-4.5"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </datalist>
            </label>
            <p className="muted">
              密钥仅在当前页面内存中使用。部署环境由评审者自备密钥。
            </p>
            <details>
              <summary>盲审评分提示词</summary>
              <pre className="prompttext">{barsPrompt}</pre>
            </details>
            <details>
              <summary>批次洞察提示词</summary>
              <pre className="prompttext">{summaryPrompt}</pre>
            </details>
            <button onClick={() => setPanel(null)}>完成</button>
          </>
        )}
        {panel === "export" && (
          <div className="stack">
            <button
              onClick={() => {
                p.exportFile("md");
                setPanel(null);
              }}
            >
              下载 Markdown 评审报告
            </button>
            <button
              onClick={() => {
                p.exportFile("json");
                setPanel(null);
              }}
            >
              下载 JSON 快照
            </button>
          </div>
        )}
        {err && (
          <p role="alert" className="warn">
            {err}
          </p>
        )}
      </dialog>
    </>
  );
}
