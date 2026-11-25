import { localLine } from "../lib/evidence";
import {
  keys,
  labels,
  decisions,
  confidenceNames,
  contrasts,
  flagLabels,
  type CandidateEvaluation,
} from "../lib/types";
import { Badges } from "./BatchOverview";
export default function CandidateDossier({
  rows,
  id,
  select,
}: {
  rows: CandidateEvaluation[];
  id: string;
  select: (id: string) => void;
}) {
  const e = rows.find((r) => r.candidate.id === id) || rows[0];
  if (!e)
    return (
      <section className="paper">完成至少一份初评后即可查阅档案。</section>
    );
  const c = e.candidate,
    g = e.glm;
  return (
    <div className="dossier">
      <aside className="paper rail">
        <h2>候选人档案</h2>
        {rows.map((r) => (
          <button
            key={r.candidate.id}
            aria-pressed={c.id === r.candidate.id}
            onClick={() => select(r.candidate.id)}
          >
            <em>{r.candidate.id}</em>
            <span>{r.candidate.title}</span>
            <i className={"tier t" + r.tier[0]}>{r.tier}</i>
          </button>
        ))}
      </aside>
      <article>
        <header className="chrome filehead">
          <span>
            候选人 {c.id}　·　{c.stage}
          </span>
          <h2>{c.title}</h2>
          <div>
            <i className={"tier t" + e.tier[0]}>{e.tier}</i> {e.compositeScore}{" "}
            分　{confidenceNames[e.confidence]}置信　
            <Badges e={e} />
          </div>
        </header>
        <section className="paper decisions">
          <div className="decision-lead">
            <h3>是否建议推进</h3>
            <p className="decision-verdict">
              <strong>{decisions[e.tier]}</strong>
              <span>{g.oneLineVerdict}</span>
            </p>
            <p className="decision-sub">{g.advanceRecommendation}</p>
          </div>
          <div className="decision-cols">
            <div className="decision-col">
              <h3>面谈重点追问</h3>
              <ol className="decision-list">
                {e.interviewQuestions.map((q, i) => (
                  <li key={i}>
                    <span className="item-idx">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="item-main">{q.question}</p>
                      <p className="item-note">核验：{q.verifyHypothesis}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="decision-col">
              <h3>建议培养方向</h3>
              <p className="plan-dir">{g.cultivationPlan.direction}</p>
              <ol className="decision-list">
                {g.cultivationPlan.suitableProjects.map((p, i) => (
                  <li key={i}>
                    <span className="item-idx">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="item-main">{p}</p>
                  </li>
                ))}
              </ol>
              <p className="item-note plan-goal">
                两周目标：{g.cultivationPlan.growthFocus}
              </p>
            </div>
          </div>
        </section>
        <section className="paper">
          <h2>四维证据拆解</h2>
          {keys.map((k) => {
            const d = g.dimensions[k];
            return (
              <div className="evid" key={k}>
                <div className="sectionhead">
                  <h3>{labels[k]}</h3>
                  <b>{d.score ? d.score + " / 5" : "证据不足"}</b>
                </div>
                {d.evidenceQuotes.map((q, i) => (
                  <blockquote key={i}>
                    <small>原文 L{localLine(c, q)}</small>　{q}
                  </blockquote>
                ))}
                <p>{d.rationale}</p>
              </div>
            );
          })}
        </section>
        <section className="paper">
          <h2>光环校准与预检</h2>
          <p>
            {contrasts[e.haloContrast]}　
            {c.haloMetadata.haloSummary.join(" · ") || "未记录头衔"}
          </p>
          <small>以上头衔在模型盲审完成后用于对照。</small>
          <p>
            {e.redFlags.map((f) => (
              <span className="badge attention" key={f}>
                {flagLabels[f]}
              </span>
            ))}
            {c.precheckSignals.hasDuplicateSentences && (
              <span className="badge attention">重复表述</span>
            )}
          </p>
          <p>
            材料长度 {c.precheckSignals.workCharCount} 字　模糊表述：
            {c.precheckSignals.vaguePhrases.join("、") || "无命中"}
          </p>
          <details>
            <summary>查看简历原文与解析告警</summary>
            {c.parseWarnings.map((v, i) => (
              <p key={i} className="warn">
                {v}
              </p>
            ))}
            <pre>
              {c.raw.split("\n").map((l, i) => (
                <span className="rawline" key={i}>
                  <em>L{i + 1}</em>
                  {l}
                  {"\n"}
                </span>
              ))}
            </pre>
          </details>
        </section>
      </article>
    </div>
  );
}
