import { useEffect, useState } from "react";
import { calm } from "../state/motion";
import { Hush } from "./art";

const BOOTED_KEY = "bl-booted";
let decided: boolean | null = null;

/** The boot runs once per browser session, only when the visit starts on the home page, never in calm mode. */
function bootOnce(): boolean {
  if (decided !== null) return decided;
  decided = false;
  if (typeof window === "undefined" || window.location.pathname !== "/" || calm()) return decided;
  try {
    if (window.sessionStorage.getItem(BOOTED_KEY)) return decided;
    window.sessionStorage.setItem(BOOTED_KEY, "1");
  } catch {
    /* Storage blocked: show it for this load only. */
  }
  decided = true;
  return decided;
}

/**
 * Boot intro (spec 6.1): a 1.2s HUD boot over the void, skippable by any click or key. The page is
 * fully rendered underneath; CSS wipes the overlay away by 1.5s even if this script stalls.
 */
export function Intro() {
  const [show, setShow] = useState(bootOnce);
  const [leaving, setLeaving] = useState(false);
  const [shut, setShut] = useState(false);

  useEffect(() => {
    if (!show) return;
    const skip = () => setLeaving(true);
    const clampShut = window.setTimeout(() => setShut(true), 860);
    const done = window.setTimeout(() => setShow(false), 1500);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.clearTimeout(clampShut);
      window.clearTimeout(done);
      window.removeEventListener("keydown", skip, true);
    };
  }, [show]);

  useEffect(() => {
    if (!leaving) return;
    const gone = window.setTimeout(() => setShow(false), 120);
    return () => window.clearTimeout(gone);
  }, [leaving]);

  if (!show) return null;
  return (
    <div className={`boot ${leaving ? "boot-leaving" : ""}`} aria-hidden="true" onPointerDown={() => setLeaving(true)}>
      <span className="boot-corner label">SYS://BOOT</span>
      <button type="button" className="boot-skip label" tabIndex={-1} onClick={() => setLeaving(true)}>Skip</button>
      <div className="boot-inner">
        <span className="boot-hush"><Hush pose="idle" head open={!shut} size={120} /></span>
        <p className="boot-word m-0" data-text="Blindlaunch">Blind<span className="text-yellow">launch</span></p>
        <p className="boot-line m-0"><span className="text-cyan">&gt;</span> Secret bids. One price. No bots.</p>
        <span className="boot-bar"><span /></span>
      </div>
    </div>
  );
}
