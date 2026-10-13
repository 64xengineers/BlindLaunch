import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { explorerUrl, network } from "../chain/config";

export function LockIcon({ className = "h-4 w-4", open = false }: { className?: string; open?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </svg>
  );
}

export function Wordmark() {
  return <span className="text-lg font-bold tracking-tight text-paper">Blindlaunch</span>;
}

export function Badge({ children, dot, tone = "teal" }: { children: ReactNode; dot?: "amber" | "teal"; tone?: "teal" | "paper" }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs sm:text-sm ${tone === "teal" ? "text-teal" : "text-paper"}`}>
      {dot ? <span className={`pulse-dot h-2 w-2 rounded-full ${dot === "amber" ? "bg-amber" : "bg-teal"}`} /> : null}
      {children}
    </span>
  );
}

function trackSpot(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--y", `${event.clientY - rect.top}px`);
}

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass spot p-5 sm:p-6 ${className}`} onMouseMove={trackSpot}>{children}</div>;
}

export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShown(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`}>{children}</div>;
}

export function PrimaryButton({
  children,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type={type} className="btn-primary w-full cursor-pointer" disabled={disabled} onClick={onClick}>
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function SecondaryButton({ children, to, href, onClick }: { children: ReactNode; to?: string; href?: string; onClick?: () => void }) {
  const className = "btn-secondary inline-flex items-center justify-center cursor-pointer no-underline transition-colors hover:border-paper hover:bg-white/5";
  if (to) return <Link className={className} to={to}>{children}</Link>;
  if (href) return <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>;
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}

export function Countdown({ target, now }: { target: number; now: number }) {
  const left = Math.max(0, target - now);
  const parts = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60];
  const labels = ["Hours", "Minutes", "Seconds"];
  return (
    <div className="flex gap-2 sm:gap-3" aria-live="polite">
      {parts.map((part, index) => (
        <div key={labels[index]} className="glass min-w-0 flex-1 px-2 py-3 text-center sm:max-w-[6.5rem] sm:px-4">
          <div className="font-mono text-2xl font-bold tabular-nums text-amber min-[400px]:text-3xl">{String(part).padStart(2, "0")}</div>
          <div className="mt-1 text-xs text-lilac">{labels[index]}</div>
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="min-h-11 shrink-0 rounded-lg px-2 text-xs text-lilac transition-colors hover:text-amber"
      aria-label={`${label} ${value}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

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

const navItems = [
  ["/", "Auctions"],
  ["/how", "How it works"],
  ["/bids", "My bids"],
  ["/team", "For teams"],
] as const;

export function Navbar({
  account,
  mon,
  onConnect,
}: {
  account: string | null;
  mon: string;
  onConnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-9 items-center rounded-full px-4 text-sm font-medium no-underline transition-colors ${
      isActive ? "bg-white/12 text-paper shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : "text-mist hover:bg-white/5 hover:text-paper"
    }`;

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || open ? "border-b border-white/10 bg-ink/75 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-4 sm:h-20 lg:grid-cols-[1fr_auto_1fr]">
        <Link to="/" className="flex w-fit items-center gap-2.5 rounded-lg no-underline" aria-label="Blindlaunch home">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber/40 bg-amber/10">
            <LockIcon className="h-[18px] w-[18px] text-amber" />
          </span>
          <span className="text-lg font-bold leading-none tracking-tight text-paper">Blindlaunch</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 lg:flex" aria-label="Primary">
          {navItems.map(([to, label]) => <NavLink key={to} end className={desktopLink} to={to}>{label}</NavLink>)}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-paper transition-colors hover:border-lavender hover:bg-white/15"
            onClick={onConnect}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${account ? "bg-teal shadow-[0_0_8px_#5EEAD4]" : "bg-lilac/60"}`} />
            {account ? (
              <>
                <span className="font-mono text-[13px]">{account}</span>
                {mon ? <span className="hidden font-normal text-lilac xl:inline">{Number(mon).toFixed(2)} MON</span> : null}
              </>
            ) : (
              <>
                <span className="hidden min-[380px]:inline">Connect wallet</span>
                <span className="min-[380px]:hidden">Connect</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-paper transition-colors hover:bg-white/15 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" className="toast mx-auto grid max-w-6xl gap-1 px-4 pb-4 lg:hidden" aria-label="Mobile">
          {navItems.map(([to, label]) => (
            <NavLink
              key={to}
              end
              to={to}
              className={({ isActive }) =>
                `flex min-h-12 items-center justify-between rounded-xl px-4 no-underline transition-colors ${
                  isActive ? "bg-white/10 font-semibold text-paper" : "text-mist hover:bg-white/5 hover:text-paper"
                }`}
            >
              {label}
              <span aria-hidden="true" className="text-lilac">→</span>
            </NavLink>
          ))}
          {account && mon ? <p className="px-4 pt-2 text-sm text-lilac">Balance {Number(mon).toFixed(2)} MON</p> : null}
        </nav>
      ) : null}
    </header>
  );
}

export function Background() {
  const stars = [
    [12, 18], [28, 42], [70, 16], [84, 38], [62, 72], [18, 78], [92, 64], [45, 8], [52, 90],
  ];
  return (
    <div className="stage absolute inset-0 -z-10" aria-hidden="true">
      <div className="glow glow-a" />
      <div className="glow glow-b" />
      {stars.map(([left, top], index) => (
        <span key={`${left}-${top}`} className="star" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 0.4}s` }} />
      ))}
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

export function Toast({ message, tone, onClose }: { message: string; tone: "ok" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:right-6 sm:bottom-6" role="status" aria-live="polite">
      <div className={`glass toast flex max-w-sm items-start gap-3 px-4 py-3 text-sm ${tone === "error" ? "border-amber/60" : "border-teal/40"}`}>
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone === "error" ? "bg-amber" : "bg-teal"}`} />
        <p className="break-words text-paper">{message}</p>
        <button type="button" className="-my-2 min-h-11 px-1 text-lilac hover:text-paper" aria-label="Dismiss" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

export function Footer() {
  const contract = network.deployment ? explorerUrl("address", network.deployment.auction) : null;
  const links = [
    ...(contract ? [["Contract", contract]] : []),
    ...(network.faucet ? [["Faucet", network.faucet]] : []),
    ["Monad docs", "https://docs.monad.xyz"],
    ["Source", "https://github.com/64xengineers/BlindLaunch"],
    ["Get support", "https://github.com/64xengineers/BlindLaunch/issues"],
  ];
  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><LockIcon className="h-5 w-5 text-amber" /><Wordmark /></div>
          <p className="mt-2 max-w-sm text-sm text-lilac">Sealed-bid, one-price token launches on {network.label}.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link className="inline-flex min-h-11 items-center text-sm text-mist no-underline hover:text-amber" to="/docs">Integration docs</Link>
          {links.map(([label, href]) => (
            <a key={label} className="inline-flex min-h-11 items-center text-sm text-mist no-underline hover:text-amber" href={href} target="_blank" rel="noreferrer">{label}</a>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-lilac">
        {network.name === "mainnet" ? "Not audited. Use small amounts." : "Test network build. Not audited. Test tokens only."} Not financial advice.
      </p>
    </footer>
  );
}
