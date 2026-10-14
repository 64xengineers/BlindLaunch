import { useEffect, useRef, useState } from "react";

/* Viewer settings: calm mode and sound. Saved in localStorage as `bl-calm` and `bl-sound`. */
const CALM_KEY = "bl-calm";
const SOUND_KEY = "bl-sound";

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    /* Private window or blocked storage: the choice lasts for this page only. */
  }
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Calm mode as the viewer set it; with no saved choice it follows the system reduced-motion setting. */
export function calmSetting(): boolean {
  if (typeof window === "undefined") return true;
  const saved = readPref(CALM_KEY);
  return saved === null ? reducedMotion() : saved === "on";
}

/** Turns calm mode on or off for the whole page (the `calm` class on the root) and saves it. */
export function setCalm(on: boolean, save = true): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("calm", on);
  if (on) document.documentElement.dataset.calm = "on";
  else delete document.documentElement.dataset.calm;
  if (save) writePref(CALM_KEY, on);
}

let soundOn = false;
let gestured = false;

/** Sound is off unless the viewer turned it on. */
export function soundSetting(): boolean {
  return soundOn;
}

export function setSound(on: boolean): void {
  soundOn = on;
  writePref(SOUND_KEY, on);
}

/** Applies saved settings before the first paint. Call once at startup. */
export function loadPrefs(): void {
  if (typeof window === "undefined") return;
  setCalm(calmSetting(), false);
  soundOn = readPref(SOUND_KEY) === "on";
  const mark = () => {
    gestured = true;
    window.removeEventListener("pointerdown", mark, true);
    window.removeEventListener("keydown", mark, true);
  };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
}

export type Sfx = "tap" | "lock" | "win" | "error";
let audio: AudioContext | null = null;

/**
 * A tiny WebAudio synth: oscillators and a noise burst through a gain envelope, no files.
 * Silent unless sound is on, the viewer has clicked or pressed a key on the page, and calm mode is off.
 */
export function sfx(name: Sfx): void {
  if (!soundOn || !gestured || calm()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.01;
    const note = (freq: number, at: number, length: number, type: OscillatorType = "square", level = 1) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, t0 + at);
      env.gain.exponentialRampToValueAtTime(level, t0 + at + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + length);
      osc.connect(env).connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + length + 0.02);
    };
    if (name === "tap") note(880, 0, 0.04);
    else if (name === "error") {
      note(180, 0, 0.09);
      note(180, 0.13, 0.09);
    } else if (name === "win") [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => note(freq, index * 0.09, index === 4 ? 0.2 : 0.09, "triangle"));
    else {
      /* KA-CHUNK: a short noise burst through a 400Hz lowpass, then a low square thud. */
      const length = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 400;
      const env = ctx.createGain();
      env.gain.value = 1.6;
      noise.connect(lowpass).connect(env).connect(master);
      noise.start(t0);
      note(110, 0.05, 0.09);
    }
  } catch {
    /* No audio on this device: stay silent. */
  }
}

/** True when the viewer asked for less motion, or switched on calm mode. */
export function calm(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.classList.contains("calm") || reducedMotion();
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
        const settled = Math.floor(step / 2);
        setText(target.split("").map((char, index) => (index < settled || char === " " ? char : glyphs[Math.floor(Math.random() * glyphs.length)]!)).join(""));
        if (settled >= target.length) {
          window.clearInterval(interval);
          setText(target);
        }
      }, 90);
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
  sfx("win");
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
  sfx("lock");
  target.animate([{ transform: "scale(1.18, .82)" }, { transform: "scale(.94, 1.06)" }, { transform: "none" }], { duration: 320, easing: "ease-out" });
  const pop = document.createElement("div");
  pop.textContent = sticker;
  pop.className = "sticker";
  Object.assign(pop.style, { position: "fixed", left: `${b.right - 20}px`, top: `${b.top - 16}px`, zIndex: "66", fontSize: "28px", animation: "pop-in .3s ease-out both", filter: "drop-shadow(5px 5px 0 #FF2A6D)" });
  document.body.appendChild(pop);
  window.setTimeout(() => pop.remove(), 1300);
}
