import { useId, useState } from "react";
import type { CandidateEvaluation } from "../lib/types";
export default function QuadrantChart({
  rows,
  select,
}: {
  rows: CandidateEvaluation[];
  select: (id: string) => void;
}) {
  const label = useId(),
    [hover, setHover] = useState("");
  const points: { x: number; y: number }[] = [];
  const X = (v: number) => 48 + (v - 1) * 112,
    Y = (v: number) => 206 - (v - 1) * 43;
  return (
    <div className="plot">
      <svg viewBox="0 0 532 245" aria-labelledby={label}>
        <title id={label}>
          候选人研究品味与闭环执行力分布。选择编号查看档案。
        </title>
        <rect x="48" y="34" width="448" height="172" fill="#fbfbf8" />
        <rect x={X(3)} y="34" width="224" height="86" fill="#edf2ee" />
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line
              x1={X(v)}
              x2={X(v)}
              y1="34"
              y2="206"
              className={v === 3 ? "mid" : "grid"}
            />
            <line
              x1="48"
              x2="496"
              y1={Y(v)}
              y2={Y(v)}
              className={v === 3 ? "mid" : "grid"}
            />
            <text x={X(v)} y="224" textAnchor="middle">
              {v}
            </text>
            <text x="35" y={Y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x="10" y="16" className="axis">
          闭环执行力
        </text>
        <text x="498" y="242" textAnchor="end" className="axis">
          研究品味
        </text>
        {[
          [55, 49, "执行见长"],
          [279, 49, "研究与执行并重"],
          [55, 194, "证据待补"],
          [279, 194, "研究见长"],
        ].map(([x, y, t]) => (
          <text key={t} x={x} y={y} className="qname">
            {t}
          </text>
        ))}
        {rows.map((e) => {
          const x = X(e.researchTasteX),
            y = Y(e.executionLoopY);
          let px = x,
            py = y;
          for (
            let i = 0;
            i < 100 && points.some((p) => Math.hypot(p.x - px, p.y - py) < 24);
            i++
          ) {
            const a = i * 2.4,
              r = 5 * Math.sqrt(i + 1);
            px = Math.min(498, Math.max(49, x + Math.cos(a) * r));
            py = Math.min(202, Math.max(37, y + Math.sin(a) * r));
          }
          points.push({ x: px, y: py });
          const id = e.candidate.id;
          return (
            <g
              key={id}
              tabIndex={0}
              role="button"
              aria-label={"打开候选人 " + id + " 档案"}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover("")}
              onFocus={() => setHover(id)}
              onBlur={() => setHover("")}
              onClick={() => select(id)}
              onKeyDown={(v) => {
                if (v.key === "Enter" || v.key === " ") {
                  v.preventDefault();
                  select(id);
                }
              }}
              className={"point tier-" + e.tier[0]}
            >
              <title>
                {id +
                  " " +
                  e.candidate.title +
                  " · " +
                  e.researchTasteX +
                  " / " +
                  e.executionLoopY}
              </title>
              {(px !== x || py !== y) && (
                <line x1={x} y1={y} x2={px} y2={py} stroke="#7e8583" />
              )}
              {e.isSpiky && (
                <circle
                  cx={px}
                  cy={py}
                  r="13.5"
                  fill="none"
                  stroke="currentColor"
                />
              )}
              <circle
                cx={px}
                cy={py}
                r="10.5"
                fill="white"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={e.confidence === "low" ? "3 2" : undefined}
              />
              <text x={px} y={py + 3.6} textAnchor="middle">
                {id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="plotlegend">
        {hover
          ? rows.find((e) => e.candidate.id === hover)?.candidate.title
          : "点击编号查看档案"}
        <span>◎ 单点尖峰　◌ 低置信度</span>
      </div>
    </div>
  );
}
