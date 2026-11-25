import { useState } from "react";
import { SlidersHorizontal, ScatterChart, RotateCcw } from "lucide-react";
import QuadrantChart from "./QuadrantChart";
import {
  keys,
  labels,
  tiers,
  decisions,
  confidenceNames,
  flagLabels,
  DEFAULT_WEIGHTS,
  type CandidateEvaluation,
  type WeightConfig,
  type ParsedCandidate,
} from "../lib/types";
import type { Job } from "../lib/batch";
export function Badges({ e }: { e: CandidateEvaluation }) {
  return (
    <>
      {e.isSpiky && <span className="badge">单点尖峰</span>}
      {e.haloContrast === "HIDDEN_GEM" && (
        <span className="badge good">逆光环高潜</span>
      )}
      {e.haloContrast === "HALO_EVIDENCE_GAP" && (
        <span className="badge attention">光环待核</span>
      )}
    </>
  );
}
interface Props {
  rows: CandidateEvaluation[];
  candidates: ParsedCandidate[];
  weights: WeightConfig;
  setWeights: (w: WeightConfig) => void;
  summary: string;
  insightLabel: string;
  changedWeights: boolean;
  jobs: Record<string, Job>;
  select: (id: string) => void;
  retry: (id: string) => void;
  regenerate: () => void;
  busy: boolean;
  now: number;
}
export default function BatchOverview(p: Props) {
  const [sort, setSort] = useState("rank");
  const sorted = [...p.rows].sort((a, b) =>
    sort === "id"
      ? a.candidate.id.localeCompare(b.candidate.id, undefined, {
          numeric: true,
        })
      : sort === "score"
        ? b.compositeScore - a.compositeScore
        : a.rank - b.rank,
  );
  const sum = keys.reduce((s, k) => s + p.weights[k], 0);
  return (
    <>
      <section className="metrics" aria-label="沟通分层">
        {tiers.map((t) => (
          <div key={t}>
            <div className="metricname">
              <i className={"tier t" + t[0]}>{t}</i>
              <span>{decisions[t]}</span>
            </div>
            <strong>{p.rows.filter((e) => e.tier === t).length}</strong>
            <span className="unit">人</span>
          </div>
        ))}
      </section>
      <section className="insight">
        <div>
          <h2>批次洞察</h2>
          <small>{p.insightLabel}</small>
        </div>
        <p>{p.summary || "完成评估后，可生成本批次的证据差异和沟通重点。"}</p>
        {!p.busy && p.rows.length > 0 && (!p.summary || p.changedWeights) && (
          <button onClick={p.regenerate}>
            {p.changedWeights ? "按当前权重更新洞察" : "生成洞察"}
          </button>
        )}
      </section>
      <div className="analysisgrid">
        <section className="paper">
          <h2>
            <ScatterChart />
            潜力象限
          </h2>
          <QuadrantChart rows={p.rows} select={p.select} />
        </section>
        <section className="paper weights">
          <h2>
            <SlidersHorizontal />
            评估权重
          </h2>
          <div className="weighthead">
            <span>
              {sum ? "相对权重，显示归一化占比" : "全零时按默认权重计算"}
            </span>
            <button
              disabled={p.busy}
              onClick={() => p.setWeights({ ...DEFAULT_WEIGHTS })}
              aria-label="重置默认权重"
            >
              <RotateCcw size={14} />
              重置
            </button>
          </div>
          {keys.map((k) => (
            <label key={k}>
              <span>{labels[k]}</span>
              <b>
                {sum
                  ? Math.round((100 * p.weights[k]) / sum)
                  : DEFAULT_WEIGHTS[k]}
                %
              </b>
              <input
                type="range"
                disabled={p.busy}
                aria-label={labels[k]}
                min="0"
                max="100"
                value={p.weights[k]}
                onChange={(e) =>
                  p.setWeights({ ...p.weights, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </section>
      </div>
      <section className="paper ranking">
        <div className="sectionhead">
          <div>
            <h2>横向对比</h2>
            <small>四维顺序为归因、问题、工程、数据；缺证以圆点显示。</small>
          </div>
          <label>
            排序{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rank">分层与得分</option>
              <option value="score">综合分</option>
              <option value="id">候选人编号</option>
            </select>
          </label>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {[
                  "排名",
                  "候选人 / 研究方向",
                  "分层与建议",
                  "潜力分",
                  "四维证据",
                  "证据与风险信号",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.candidate.id}>
                  <td>{String(e.rank).padStart(2, "0")}</td>
                  <td>
                    <button
                      className="rowlink"
                      onClick={() => p.select(e.candidate.id)}
                    >
                      <em>{e.candidate.id}</em>
                      {e.candidate.title}
                    </button>
                  </td>
                  <td>
                    <i className={"tier t" + e.tier[0]}>{e.tier}</i>{" "}
                    {decisions[e.tier]}
                  </td>
                  <td className="score">
                    {e.compositeScore}
                    {p.jobs[e.candidate.id]?.state === "done" && (
                      <small className="time">
                        {(p.jobs[e.candidate.id].ms / 1000).toFixed(1)} 秒
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="minibars" aria-label="四维 BARS 分值">
                      {keys.map((k) => (
                        <span
                          key={k}
                          title={labels[k] + " " + e.glm.dimensions[k].score}
                          style={{
                            height: 3 + e.glm.dimensions[k].score * 3 + "px",
                          }}
                        >
                          {e.glm.dimensions[k].score || "·"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badges e={e} />
                    {e.redFlags.map((f) => (
                      <span key={f} className="badge attention">
                        {flagLabels[f]}
                      </span>
                    ))}
                    <small>{confidenceNames[e.confidence]}置信</small>
                  </td>
                </tr>
              ))}
              {p.candidates
                .filter((c) => !p.rows.some((e) => e.candidate.id === c.id))
                .map((c) => {
                  const j = p.jobs[c.id];
                  return (
                    <tr key={c.id}>
                      <td>—</td>
                      <td>
                        {c.id}　{c.title}
                      </td>
                      <td colSpan={4}>
                        {j?.state === "error" ? (
                          <>
                            <span className="warn">{j.error}</span>{" "}
                            <button
                              disabled={p.busy}
                              onClick={() => p.retry(c.id)}
                            >
                              重试此人
                            </button>
                          </>
                        ) : j?.state === "running" ? (
                          "评估中 · " +
                          Math.max(
                            0,
                            Math.floor((p.now - (j.start || p.now)) / 1000),
                          ) +
                          " 秒"
                        ) : (
                          "等待初评"
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
