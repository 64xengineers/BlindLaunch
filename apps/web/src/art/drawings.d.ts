export type IconName =
  | "lock" | "unlock" | "key" | "clock" | "eye-off" | "equals" | "arrow-up-right" | "shield" | "check" | "x" | "alert" | "info"
  | "external" | "chevron-right" | "chevron-left" | "chevron-down" | "plus" | "minus" | "flag" | "grid" | "wallet" | "fingerprint"
  | "coin" | "dollar" | "return" | "bag" | "pause" | "play" | "speaker" | "speaker-off" | "wave" | "flat-line" | "copy" | "sparkle"
  | "star" | "half" | "menu";
export type HushPose = "idle" | "excited" | "locking" | "waiting" | "win" | "fair" | "missed" | "refund" | "error";
export type ArtId = "ncat" | "snail" | "ramen" | "moth" | "frog" | "goblin" | "coo";
export function icon(name: IconName, size?: number, cls?: string): string;
export function hush(pose: HushPose, size: number, opts?: { head?: boolean; open?: boolean; cls?: string; still?: boolean; coin?: string; eyes?: string }): string;
export function hushParts(pose: HushPose, opts?: { head?: boolean; eyes?: string }): string;
export function art(id: ArtId, size?: number, cls?: string): string;
export function comic(n: 1 | 2 | 3 | 4, label: string): string;
export function skyline(): string;
export const badgeColor: Record<ArtId, string>;
