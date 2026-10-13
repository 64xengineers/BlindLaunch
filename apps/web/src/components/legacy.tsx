/* Widgets from the previous design, kept only until the screens stop using them. */
import { useState } from "react";
import { LockIcon } from "./ui";

export function StepChart({
  prices,
  demand,
  supply,
  clearingIndex,
  empty,
  priceLabel = "One price",
}: {
  prices: string[];
  demand: number[];
  supply: number;
  clearingIndex: number | null;
  empty?: string;
  priceLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 460;
  const height = 250;
  const left = 8;
  const right = 8;
  const top = 34;
  const bottom = 34;
  const count = Math.max(1, prices.length);
  const segment = (width - left - right) / count;
  const maxY = Math.max(1, supply, ...demand) * 1.2;
  const y = (value: number) => top + (1 - value / maxY) * (height - top - bottom);
  const x = (index: number) => left + index * segment;
  const hasDemand = demand.some((value) => value > 0);
  const path = demand
    .map((value, index) => (index === 0 ? `M${x(0)} ${y(value)} H${x(1)}` : `V${y(value)} H${x(index + 1)}`))
    .join(" ");
  const clearX = clearingIndex === null ? null : x(clearingIndex) + segment / 2;
  const shown = hover ?? clearingIndex;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Demand by price. Tokens for sale ${supply}.`}>
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1={left} x2={width - right} y1={top + (line * (height - top - bottom)) / 4} y2={top + (line * (height - top - bottom)) / 4} stroke="rgba(143,140,240,0.14)" />
        ))}
        {hasDemand ? <path key={path} className="sweep" pathLength={1} d={path} fill="none" stroke="#8F8CF0" strokeWidth="2.5" /> : null}
        <line x1={left} x2={width - right} y1={y(supply)} y2={y(supply)} stroke="#FFC53D" strokeDasharray="5 5" strokeOpacity="0.8" />
        <text x={left + 2} y={y(supply) - 7} fill="#D6D5FA" fontSize="11">Tokens for sale: {supply}</text>
        {clearX !== null ? (
          <>
            <line className="sweep" pathLength={1} x1={clearX} x2={clearX} y1={top - 8} y2={height - bottom} stroke="#FFC53D" strokeWidth="2" />
            <circle cx={clearX} cy={y(supply)} r="5" fill="#FFC53D" />
            <text x={Math.min(clearX + 8, width - 120)} y={top - 14} fill="#FFC53D" fontSize="12" fontWeight="700">{priceLabel}: {prices[clearingIndex ?? 0]}</text>
          </>
        ) : null}
        {prices.map((price, index) => (
          <g key={price + index}>
            <text x={x(index) + segment / 2} y={height - 12} textAnchor="middle" fill={index === shown ? "#FFC53D" : "#B9B7F5"} fontSize="11" fontFamily="JetBrains Mono, monospace">{price}</text>
            <rect
              x={x(index)}
              y={top}
              width={segment}
              height={height - top - bottom}
              fill={hover === index ? "rgba(143,140,240,0.10)" : "transparent"}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        {!hasDemand && empty ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="#B9B7F5" fontSize="13">{empty}</text>
        ) : null}
      </svg>
      {hover !== null ? (
        <p className="pointer-events-none absolute right-2 top-0 rounded-lg border border-white/15 bg-ink/90 px-2 py-1 font-mono text-xs text-paper">
          price {prices[hover]} · demand {demand[hover] ?? 0}
        </p>
      ) : null}
    </div>
  );
}

export function Vault() {
  const [hot, setHot] = useState(false);
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[18rem] sm:max-w-[20rem]"
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      aria-hidden="true"
    >
      <div className="spin-slow absolute inset-0 rounded-full border border-dashed border-lavender/60">
        <span className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-amber shadow-[0_0_18px_#FFC53D]" />
        <span className="absolute -right-1 top-1/2 h-2 w-2 rounded-full bg-teal shadow-[0_0_14px_#5EEAD4]" />
      </div>
      <div className="absolute inset-[14%] rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm" />
      <div
        className={`absolute inset-[29%] grid place-items-center rounded-full border-2 border-amber/80 bg-ink/40 transition-all duration-500 ${hot ? "scale-105 shadow-[0_0_70px_rgba(255,197,61,0.35)]" : "shadow-[0_0_40px_rgba(255,197,61,0.15)]"}`}
      >
        <LockIcon className="h-1/3 w-1/3 text-amber" open={hot} />
      </div>
    </div>
  );
}

