import { contrastRatio, deltaE, fromOklch, over, toHex, toOklch, toRGBA, type RGBA } from "./color.js";

export type Level = "AA" | "AA-large" | "AAA" | "AAA-large" | "UI";

/** Minimum contrast ratio for each WCAG 2.2 requirement. */
export const TARGETS: Record<Level, number> = { AA: 4.5, "AA-large": 3, AAA: 7, "AAA-large": 4.5, UI: 3 };

export interface Grade {
  ratio: number;
  /** Normal text, success criterion 1.4.3 (≥ 4.5). */
  AA: boolean;
  /** Large text — 24px, or 18.66px bold (≥ 3). */
  "AA-large": boolean;
  /** Normal text, 1.4.6 (≥ 7). */
  AAA: boolean;
  "AAA-large": boolean;
  /** Icons, borders and form controls, 1.4.11 (≥ 3). */
  UI: boolean;
}

const round = (x: number) => Math.round(x * 100) / 100;

export function grade(fg: RGBA | string, bg: RGBA | string): Grade {
  const ratio = contrastRatio(fg, bg);
  const pass = (t: number) => ratio + 1e-9 >= t;
  return { ratio: round(ratio), AA: pass(4.5), "AA-large": pass(3), AAA: pass(7), "AAA-large": pass(4.5), UI: pass(3) };
}

export interface FixOptions {
  /** A level ("AA", "AAA"…) or a number such as 4.5. Default "AA". */
  target?: Level | number;
  /** Which color may change. Default "foreground". */
  adjust?: "foreground" | "background";
}

export interface Fix {
  /** The new color, as hex. */
  color: string;
  ratio: number;
  /** How different the new color is from the original (OKLab ×100). */
  deltaE: number;
  direction: "darker" | "lighter" | "none";
  changed: boolean;
}

/**
 * Finds the closest color (same hue, chroma kept when the gamut allows) that reaches the target contrast.
 * Tries both darker and lighter and returns the smaller change.
 */
export function fixContrast(fg: RGBA | string, bg: RGBA | string, options: FixOptions = {}): Fix {
  const target = typeof options.target === "number" ? options.target : TARGETS[options.target ?? "AA"];
  const adjustBg = options.adjust === "background";
  const fixed = toRGBA(adjustBg ? fg : bg);
  let moving = toRGBA(adjustBg ? bg : fg);
  if (!adjustBg && moving.a < 1) moving = over(moving, fixed);
  const ratioFor = (c: RGBA) => (adjustBg ? contrastRatio(fixed, c) : contrastRatio(c, fixed));
  const start = ratioFor(moving);
  if (start + 1e-9 >= target) {
    return { color: toHex(moving), ratio: round(start), deltaE: 0, direction: "none", changed: false };
  }
  const lch = toOklch(moving);
  const at = (l: number) => fromOklch({ ...lch, l: Math.min(1, Math.max(0, l)), a: 1 });
  const found: Fix[] = [];
  for (const [direction, end] of [["darker", 0], ["lighter", 1]] as const) {
    if (ratioFor(at(end)) + 1e-9 < target) continue;
    let lo = lch.l;
    let hi: number = end;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ratioFor(at(mid)) >= target) hi = mid;
      else lo = mid;
    }
    // rounding to hex can drop the ratio a hair below the target: nudge until the hex itself passes
    let l = hi;
    let color = toHex(at(l));
    for (let i = 0; i < 50 && ratioFor(toRGBA(color)) < target; i++) {
      l += direction === "darker" ? -0.002 : 0.002;
      color = toHex(at(l));
    }
    found.push({ color, ratio: round(ratioFor(toRGBA(color))), deltaE: round(deltaE(moving, color)), direction, changed: true });
  }
  if (!found.length) {
    const best = ["#000000", "#ffffff"].map((c) => ({ c, r: ratioFor(toRGBA(c)) })).sort((a, b) => b.r - a.r)[0];
    return {
      color: best.c,
      ratio: round(best.r),
      deltaE: round(deltaE(moving, best.c)),
      direction: best.c === "#000000" ? "darker" : "lighter",
      changed: true,
    };
  }
  return found.sort((a, b) => a.deltaE - b.deltaE)[0];
}
