import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { explorerUrl, network } from "../chain/config";
import { Hush, Icon, type IconName } from "./art";

export { Hush, Icon, TokenArt, ComicArt } from "./art";

export function LockIcon({ className = "", open = false }: { className?: string; open?: boolean }) {
  return <Icon name={open ? "unlock" : "lock"} size={18} className={className} />;
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="font-sans font-bold italic uppercase tracking-[0.04em] text-paper" style={{ fontSize: size }}>
      Blind<span className="text-yellow">launch</span>
    </span>
  );
}

/** A HUD panel with one cut corner. `accent` adds the cyan tab on the top edge. */
export function Panel({ children, className = "", large = false, accent = false, as: Tag = "div", style }: { children: ReactNode; className?: string; large?: boolean; accent?: boolean; as?: "div" | "section" | "article" | "li"; style?: CSSProperties }) {
  return <Tag className={`panel ${large ? "panel-lg" : ""} ${accent ? "panel-accent" : ""} ${className}`} style={style}>{children}</Tag>;
}

/** Kept for older call sites: a padded panel. */
export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Panel className={`p-5 sm:p-6 ${className}`}>{children}</Panel>;
}

export type StickerTone = "yellow" | "cyan" | "magenta" | "coral" | "green" | "violet" | "paper";
const toneVar: Record<StickerTone, string> = {
  yellow: "var(--color-yellow)", cyan: "var(--color-cyan)", magenta: "var(--color-magenta)", coral: "var(--color-coral)",
  green: "var(--color-green)", violet: "var(--color-violet)", paper: "var(--color-paper)",
};

/** A tilted comic sticker: state labels like LIVE NOW, DONE, STUCK. Always word + colour. */
export function Sticker({ children, tone = "yellow", live = false, className = "" }: { children: ReactNode; tone?: StickerTone; live?: boolean; className?: string }) {
  return (
    <span className={`sticker ${className}`} style={{ "--sticker": toneVar[tone] } as CSSProperties}>
      {live ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Older badge API, now a small HUD label. */
export function Badge({ children, dot, tone = "teal" }: { children: ReactNode; dot?: "amber" | "teal"; tone?: "teal" | "paper" }) {
  return (
    <span className={`label inline-flex items-center gap-2 border-2 border-line bg-panel px-3 py-1.5 ${tone === "teal" ? "!text-cyan" : "!text-paper"}`}>
      {dot ? <span className={`pulse-dot h-2 w-2 ${dot === "amber" ? "bg-yellow" : "bg-cyan"}`} /> : null}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, className = "" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "cyan" | "yellow" | "green" | "coral"; className?: string }) {
  const colour = tone ? { cyan: "text-cyan", yellow: "text-yellow", green: "text-green", coral: "text-coral" }[tone] : "text-paper";
  return (
    <Panel className={`stat ${className}`}>
      <div className="label">{label}</div>
      <div className={`v ${colour}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm font-semibold text-muted">{sub}</div> : null}
    </Panel>
  );
}

export type TrackerStage = "bid" | "unlock" | "result" | "trading";
const stages: [TrackerStage, string][] = [["bid", "Bid in secret"], ["unlock", "Unlock"], ["result", "Result"], ["trading", "Trading"]];

/** The mission tracker: BID IN SECRET → UNLOCK → RESULT → TRADING. */
export function Tracker({ now, bad = false, done = false, className = "" }: { now: TrackerStage; bad?: boolean; done?: boolean; className?: string }) {
  const at = stages.findIndex(([key]) => key === now);
  return (
    <ol className={`tracker m-0 list-none p-0 ${className}`} aria-label="Launch progress">
      {stages.map(([key, label], index) => (
        <li key={key} className={index < at || (done && index === at) ? "is-done" : index === at ? (bad ? "is-bad" : "is-now") : ""} aria-current={index === at ? "step" : undefined}>
          <span className="n">{index < at || (done && index === at) ? "✓" : index + 1}</span>
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Bubble({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bubble bubble-left ${className}`}>{children}</div>;
}

/** Hush with a speech bubble beside him. */
export function HushSays({ pose = "idle", children, size = 120, className = "" }: { pose?: Parameters<typeof Hush>[0]["pose"]; children: ReactNode; size?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-[auto_1fr] items-center gap-5 ${className}`}>
      <Hush pose={pose} size={size} className="bob" />
      <Bubble>{children}</Bubble>
    </div>
  );
}

/** The paper receipt: a few plain lines with an icon each. */
export function Receipt({ title, aside, children, className = "", id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <div className={`receipt ${className}`} id={id}>
      <div className="receipt-head"><span>{title}</span>{aside ? <span>{aside}</span> : null}</div>
      {children}
    </div>
  );
}

export function ReceiptRow({ icon, tone = "yellow", label, value }: { icon: IconName; tone?: "yellow" | "cyan" | "green" | "coral" | "violet" | "paper"; label: ReactNode; value: ReactNode }) {
  return (
    <div className="receipt-row">
      <span className="ic-box" style={{ "--ic": toneVar[tone] } as CSSProperties}><Icon name={icon} size={20} /></span>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** One simple bar. The only "chart" allowed. */
export function Meter({ value, max, tone = "cyan", label }: { value: number; max: number; tone?: "cyan" | "green" | "yellow" | "coral"; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} style={{ "--meter": `var(--color-${tone})` } as CSSProperties}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A collapsed section ("See all bids", "Trouble collecting?", "Proof"). */
export function Fold({ title, children, className = "", defaultOpen = false }: { title: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={`fold ${className}`} open={defaultOpen}>
      <summary className="font-bold text-paper hover:text-cyan">
        <span>{title}</span>
        <Icon name="chevron-down" size={20} className="chev text-cyan" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rise ${className}`}>{children}</div>;
}

export function PrimaryButton({ children, type = "button", disabled, onClick, icon, tone = "yellow", className = "w-full", id }: {
  children: ReactNode; type?: "button" | "submit"; disabled?: boolean; onClick?: () => void; icon?: IconName; tone?: "yellow" | "green" | "cyan"; className?: string; id?: string;
}) {
  return (
    <button id={id} type={type} className={`btn-primary ${tone === "green" ? "btn-green" : tone === "cyan" ? "btn-cyan" : ""} ${className}`} disabled={disabled} onClick={onClick}>
      <span className="sheen" aria-hidden="true" />
      {icon ? <Icon name={icon} size={24} /> : null}
      <span>{children}</span>
    </button>
  );
}

/** A link styled as the one primary action. */
export function PrimaryLink({ children, to, icon, className = "" }: { children: ReactNode; to: string; icon?: IconName; className?: string }) {
  return (
    <Link to={to} className={`btn-primary ${className}`}>
      <span className="sheen" aria-hidden="true" />
      {icon ? <Icon name={icon} size={24} /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function SecondaryButton({ children, to, href, onClick, icon, disabled, className = "" }: { children: ReactNode; to?: string; href?: string; onClick?: () => void; icon?: IconName; disabled?: boolean; className?: string }) {
  const inner = <>{icon ? <Icon name={icon} size={18} /> : null}<span>{children}</span></>;
  if (to) return <Link className={`btn-2 ${className}`} to={to}>{inner}</Link>;
  if (href) return <a className={`btn-2 ${className}`} href={href} target="_blank" rel="noreferrer">{inner}<Icon name="external" size={16} /></a>;
  return <button type="button" className={`btn-2 ${className}`} onClick={onClick} disabled={disabled}>{inner}</button>;
}

function clock(left: number): string {
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  if (days > 0) return `${days}d ${two(hours)}h`;
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`;
  return `${two(minutes)}:${two(seconds)}`;
}

/** Plain-text time left: 14:32, 2:10:44 or 2d 04h. */
export function timeLeft(target: number, now: number): string {
  return clock(Math.max(0, target - now));
}

/** The big HUD countdown. Turns coral in the last minute. */
export function Countdown({ target, now, size = "xl" }: { target: number; now: number; size?: "xl" | "lg" }) {
  const left = Math.max(0, target - now);
  const urgent = left > 0 && left < 60;
  return (
    <div
      className={`num pop-text font-bold leading-[0.9] ${size === "xl" ? "text-[clamp(56px,7vw,96px)]" : "text-[40px]"} ${urgent ? "text-coral" : "text-yellow"}`}
      role="timer"
      aria-live="off"
      aria-label={`${clock(left)} left`}
    >
      {clock(left)}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="label inline-flex min-h-10 shrink-0 items-center gap-1.5 px-2 !text-cyan hover:!text-yellow"
      aria-label={`${label} ${value}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={16} />
      {copied ? "Copied" : label}
    </button>
  );
}

const navItems = [
  ["/", "Launches"],
  ["/bids", "My bids"],
  ["/create", "Create"],
  ["/team", "My launches"],
  ["/how", "How it works"],
] as const;

export function Navbar({ account, mon, onConnect }: { account: string | null; mon: string; onConnect: () => void }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-11 items-center px-4 text-[15px] font-bold uppercase tracking-[0.08em] no-underline transition-colors ${
      isActive ? "bg-panel text-paper shadow-[inset_0_-3px_0_var(--color-cyan)]" : "text-muted hover:text-cyan"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-void/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1360px] items-center gap-6 px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 no-underline" aria-label="Blindlaunch home">
          <Hush pose="idle" size={36} head />
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navItems.map(([to, label]) => <NavLink key={to} end className={tab} to={to}>{label}</NavLink>)}
        </nav>
        <div className="flex-1" />
        <span className="label hidden items-center gap-2 !text-green sm:inline-flex">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-green" aria-hidden="true" />
          {network.label}
        </span>
        <button type="button" className="btn-2 !min-h-11 !normal-case !tracking-normal" onClick={onConnect}>
          <Icon name={account ? "wallet" : "fingerprint"} size={18} />
          {account ? (
            <>
              <span className="num text-[15px]">{account}</span>
              {mon ? <span className="num hidden text-green xl:inline">{Number(mon).toFixed(2)} MON</span> : null}
            </>
          ) : (
            <span className="uppercase tracking-[0.06em]">Connect</span>
          )}
        </button>
        <button
          type="button"
          className="btn-2 !min-h-11 !px-3 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "x" : "menu"} size={20} />
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" className="mx-auto grid max-w-[1360px] gap-1 px-8 pb-4 lg:hidden" aria-label="Mobile">
          {navItems.map(([to, label]) => <NavLink key={to} end to={to} className={tab}>{label}</NavLink>)}
        </nav>
      ) : null}
    </header>
  );
}

/** Kept for older call sites; the world now draws itself in `World`. */
export function Background() {
  return null;
}

export function Toast({ message, tone, onClose }: { message: string; tone: "ok" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-[75] flex justify-end" role="status" aria-live="polite">
      <div className="toast toast-card" style={{ "--toast-pop": tone === "error" ? "var(--color-coral)" : "var(--color-cyan)" } as CSSProperties}>
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border-2 border-black" style={{ background: tone === "error" ? "var(--color-coral)" : "var(--color-green)" }}>
          <Icon name={tone === "error" ? "alert" : "check"} size={16} />
        </span>
        <p className="m-0 break-words">{message}</p>
        <button type="button" className="-my-1 grid min-h-9 min-w-9 place-items-center hover:opacity-70" aria-label="Dismiss" onClick={onClose}><Icon name="x" size={16} /></button>
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
    <footer className="relative z-10 mt-10 border-t-2 border-line bg-void/90">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-6 px-8 py-8">
        <div className="flex items-center gap-4">
          <Hush pose="idle" size={56} />
          <div>
            <Wordmark size={20} />
            <p className="m-0 mt-1 text-[15px] text-muted">Secret bids. One price. No bots. On {network.label}.</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link className="label inline-flex min-h-10 items-center no-underline hover:!text-cyan" to="/docs">Integration docs</Link>
          {links.map(([label, href]) => (
            <a key={label} className="label inline-flex min-h-10 items-center no-underline hover:!text-cyan" href={href} target="_blank" rel="noreferrer">{label}</a>
          ))}
        </nav>
      </div>
      <p className="mx-auto m-0 max-w-[1360px] px-8 pb-6 text-sm text-muted">
        {network.name === "mainnet" ? "Not audited. Use small amounts." : "Test network build. Not audited. Test tokens only."} Not financial advice.
      </p>
    </footer>
  );
}
