import { type EvolutionChange } from "@kgos/sdk";

export function ChangeGraph({ change }: { change: EvolutionChange }) {
  const before = change.beforeRef;
  const after = change.afterRef;
  const continuity =
    before !== undefined && after !== undefined && (before === after || change.change === "rename");
  return (
    <figure className="change-graph">
      <svg
        role="img"
        aria-label={`${change.change} · ${change.kind} 公开变化`}
        viewBox="0 0 640 130"
        style={{ width: "100%", maxHeight: 180 }}
      >
        <title>
          {before ?? "Before 未出现"} → {after ?? "After 未出现"} · {change.path}
        </title>
        {before !== undefined && (
          <g>
            <rect
              x="12"
              y="24"
              width="230"
              height="70"
              rx="14"
              fill="#fff4ee"
              stroke="#b42318"
              strokeWidth="2"
            />
            <text x="26" y="48" fill="#b42318">
              Before · {change.change === "delete" ? "删除" : "原值"}
            </text>
            <text x="26" y="76">
              {before}
            </text>
          </g>
        )}
        {after !== undefined && (
          <g>
            <rect
              x="398"
              y="24"
              width="230"
              height="70"
              rx="14"
              fill="#e9f8f2"
              stroke="#067647"
              strokeWidth="2"
            />
            <text x="412" y="48" fill="#067647">
              After · {change.change === "add" ? "新增" : "新值"}
            </text>
            <text x="412" y="76">
              {after}
            </text>
          </g>
        )}
        {continuity && (
          <g>
            <path
              d="M 250 62 L 386 62 M 376 56 L 386 62 L 376 68"
              fill="none"
              stroke="#0066ff"
              strokeWidth="2"
            />
            <text x="320" y="44" textAnchor="middle" fill="#0066ff">
              {change.change}
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        已知对象变化范围 · {change.kind} · {change.path === "" ? "整个 Object" : change.path}
        {continuity ? " · 后端已有 continuity 证据" : " · 两侧按各自 Ref 显示"}
      </figcaption>
    </figure>
  );
}
