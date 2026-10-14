import { memo } from "react";
import type { Address } from "viem";
import { art, comic, hush, icon, skyline, type ArtId, type HushPose, type IconName } from "../art/drawings";

export type { ArtId, HushPose, IconName };

/** Shared SVG definitions the drawings reference by id. Render once, near the root. */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="bl-hush-clip"><rect x="18" y="52" width="84" height="70" rx="18" /></clipPath>
        <pattern id="bl-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000" /></pattern>
        <linearGradient id="bl-scan-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00F0FF" />
          <stop offset="1" stopColor="#00F0FF" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** A 24x24 line icon in the current text colour. */
export const Icon = memo(function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <span className={`inline-grid shrink-0 place-items-center ${className}`} dangerouslySetInnerHTML={{ __html: icon(name, size) }} />;
});

/** Hush, the padlock mascot. `open` lifts the shackle (used by the lock animation). */
export const Hush = memo(function Hush({ pose = "idle", size = 120, head = false, open, className = "" }: { pose?: HushPose; size?: number; head?: boolean; open?: boolean; className?: string }) {
  return <span className={`inline-block shrink-0 leading-none ${className}`} dangerouslySetInnerHTML={{ __html: hush(pose, size, { head, ...(open === undefined ? {} : { open }) }) }} />;
});

const ART_IDS: ArtId[] = ["ncat", "goblin", "snail", "ramen", "moth", "frog", "coo"];

/** The same token always gets the same face: picked from its address. */
export function artFor(address: Address | string): ArtId {
  const hex = address.toLowerCase().replace(/^0x/, "");
  let sum = 0;
  for (let index = 0; index < hex.length; index += 1) sum = (sum * 31 + hex.charCodeAt(index)) % 9973;
  return ART_IDS[sum % ART_IDS.length]!;
}

export const TokenArt = memo(function TokenArt({ address, size = 64, className = "" }: { address: Address | string; size?: number; className?: string }) {
  return <span className={`inline-block shrink-0 leading-none ${className}`} dangerouslySetInnerHTML={{ __html: art(artFor(address), size) }} />;
});

export const ComicArt = memo(function ComicArt({ panel, label }: { panel: 1 | 2 | 3 | 4; label: string }) {
  return <span className="block" dangerouslySetInnerHTML={{ __html: comic(panel, label) }} />;
});

/** Grid, glow, night skyline and scanlines behind every page. */
export function World() {
  return (
    <>
      <div className="world-grid" aria-hidden="true" />
      <div className="world-skyline" aria-hidden="true" dangerouslySetInnerHTML={{ __html: skyline() }} />
      <div className="scanlines" aria-hidden="true" />
    </>
  );
}
