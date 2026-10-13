import { useEffect, useRef, useState } from "react";

/** True when the viewer asked for less motion, or switched on calm mode. */
export function calm(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.classList.contains("calm") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Text that decodes from scrambled characters into `target` (the final-price reveal). */
export function useDecode(target: string, delay = 0): string {
  const [text, setText] = useState(() => (calm() ? target : target.replace(/[0-9]/g, "0")));
  useEffect(() => {
    if (calm()) {
      setText(target);
      return;
    }
    const glyphs = "$0123456789#%&?";
    let step = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        step += 1;
        const settled = Math.floor(step / 3);
        setText(target.split("").map((char, index) => (index < settled || char === " " ? char : glyphs[Math.floor(Math.random() * glyphs.length)]!)).join(""));
        if (settled >= target.length) {
          window.clearInterval(interval);
          setText(target);
        }
      }, 45);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [target, delay]);
  return text;
}

/** A number that counts up to `value` once it changes. */
export function useCountUp(value: number, duration = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (calm()) {
      setShown(value);
      from.current = value;
      return;
    }
    const begin = performance.now();
    const start = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(start + (value - start) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/** Cartoon confetti from an element's top centre. Wins only; never in calm mode. */
export function confetti(from?: Element | null, count = 160): void {
  if (calm()) return;
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "65" });
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  const box = from?.getBoundingClientRect();
  const x0 = box ? box.left + box.width / 2 : window.innerWidth / 2;
  const y0 = box ? box.top + 40 : window.innerHeight / 3;
  const colours = ["#FCEE0A", "#00F0FF", "#FF2A6D", "#05FFA1", "#B48CFF"];
  const parts = Array.from({ length: count }, (_, index) => ({
    x: x0, y: y0, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 16 - 4, r: Math.random() * 6 + 5, c: colours[index % colours.length]!, a: Math.random() * 6, life: 0,
  }));
  const frame = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      p.life += 1;
      p.vy += 0.45;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.a += 0.2;
      if (p.y > canvas.height + 20 || p.life > 170) continue;
      alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * The Clamp: `item` flies into `target` leaving cyan, magenta and yellow afterimages, then a
 * sticker pops beside the target. Resolves when the item has landed. Calm mode resolves at once.
 */
export async function clamp(item: HTMLElement, target: HTMLElement, sticker = "KA-CHUNK!"): Promise<void> {
  if (calm()) return;
  const a = item.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const to = { transform: `translate(${dx}px, ${dy}px) scale(0.08) rotate(-25deg)`, opacity: 0 };
  const easing = "cubic-bezier(.6,0,.9,.4)";
  ["#00F0FF", "#FF2A6D", "#FCEE0A"].forEach((colour, index) => {
    const ghost = item.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    Object.assign(ghost.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, margin: "0", zIndex: "64", filter: "none", background: colour, opacity: "0.7", pointerEvents: "none" });
    document.body.appendChild(ghost);
    ghost.animate([{ transform: "none" }, to], { duration: 520, delay: 40 + index * 45, easing, fill: "forwards" }).onfinish = () => ghost.remove();
  });
  await item.animate([{ transform: "none", opacity: 1 }, to], { duration: 520, easing, fill: "forwards" }).finished;
  target.animate([{ transform: "scale(1.18, .82)" }, { transform: "scale(.94, 1.06)" }, { transform: "none" }], { duration: 320, easing: "ease-out" });
  const pop = document.createElement("div");
  pop.textContent = sticker;
  pop.className = "sticker";
  Object.assign(pop.style, { position: "fixed", left: `${b.right - 20}px`, top: `${b.top - 16}px`, zIndex: "66", fontSize: "28px", animation: "pop-in .3s ease-out both", filter: "drop-shadow(5px 5px 0 #FF2A6D)" });
  document.body.appendChild(pop);
  window.setTimeout(() => pop.remove(), 1300);
}
