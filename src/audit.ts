import { deltaE, parseColor, simulate, toHex, type Deficiency } from "./color.js";
import { fixContrast, grade, TARGETS, type Grade, type Level } from "./wcag.js";

export interface PairResult extends Grade {
  foreground: string;
  background: string;
  foregroundName?: string;
  backgroundName?: string;
  /** Where the pair came from (CSS selector and line, or token names). */
  location?: string;
  level: Level;
  pass: boolean;
  /** Closest passing alternative: the side (text or background) that needs the smaller change. */
  suggestion?: { color: string; ratio: number; deltaE: number; adjust: "foreground" | "background" };
}

export interface AuditOptions {
  level?: Level;
  /** Explicit pairs of token names: [["text", "background"], ...]. */
  pairs?: Array<[string, string]>;
}

const FG = /(^|[-_.\s])(text|fg|foreground|on|content|label|icon|link|heading|title|ink)([-_.\s]|$)/i;
const BG = /(^|[-_.\s])(bg|background|surface|base|canvas|card|paper|page|backdrop|fill)([-_.\s]|$)/i;

function isColor(v: string): boolean {
  try {
    parseColor(v);
    return true;
  } catch {
    return false;
  }
}

function check(fg: string, bg: string, level: Level, extra: Partial<PairResult>): PairResult {
  const g = grade(fg, bg);
  const pass = g.ratio + 1e-9 >= TARGETS[level];
  const result: PairResult = { ...g, foreground: toHex(parseColor(fg)), background: toHex(parseColor(bg)), level, pass, ...extra };
  if (!pass) {
    const options = (["foreground", "background"] as const).map((adjust) => ({ ...fixContrast(fg, bg, { target: level, adjust }), adjust }));
    const best = options.sort((a, b) => a.deltaE - b.deltaE)[0];
    result.suggestion = { color: best.color, ratio: best.ratio, deltaE: best.deltaE, adjust: best.adjust };
  }
  return result;
}

/** Checks one foreground/background pair. */
export function checkPair(fg: string, bg: string, level: Level = "AA"): PairResult {
  return check(fg, bg, level, {});
}

export type TokenTree = { [k: string]: string | number | TokenTree | undefined };

/** Flattens nested design tokens (W3C `$value`, Style Dictionary `value`) and resolves `{a.b}` references. */
export function flattenTokens(tree: TokenTree, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, val] of Object.entries(tree)) {
    if (key.startsWith("$")) continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object") {
      const v = (val as TokenTree).$value ?? (val as TokenTree).value;
      if (typeof v === "string") out[name] = v;
      else flattenTokens(val as TokenTree, name, out);
    } else if (typeof val === "string") {
      out[name] = val;
    }
  }
  if (!prefix) {
    for (let pass = 0; pass < 5; pass++) {
      for (const [k, v] of Object.entries(out)) {
        const ref = /^\{(.+)\}$/.exec(v.trim());
        if (ref && out[ref[1]]) out[k] = out[ref[1]];
      }
    }
  }
  return out;
}

/** Audits a palette. Without `pairs`, text-like tokens are checked against background-like tokens. */
export function auditTokens(tokens: TokenTree, options: AuditOptions = {}): PairResult[] {
  const level = options.level ?? "AA";
  const flat = Object.fromEntries(Object.entries(flattenTokens(tokens)).filter(([, v]) => isColor(v)));
  let pairs = options.pairs;
  if (!pairs) {
    const fgs = Object.keys(flat).filter((k) => FG.test(k));
    const bgs = Object.keys(flat).filter((k) => BG.test(k));
    pairs = fgs.length && bgs.length
      ? fgs.flatMap((f) => bgs.map((b) => [f, b] as [string, string]))
      : Object.keys(flat).flatMap((f) => Object.keys(flat).filter((b) => b !== f).map((b) => [f, b] as [string, string]));
  }
  return pairs.map(([f, b]) => {
    if (!(f in flat) || !(b in flat)) throw new Error(`Unknown token: ${!(f in flat) ? f : b}`);
    return check(flat[f], flat[b], level, { foregroundName: f, backgroundName: b, location: `${f} on ${b}` });
  });
}

function firstColor(value: string): string | null {
  const m = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/i.exec(value);
  if (m) return m[0];
  for (const word of value.split(/[\s,]+/)) if (isColor(word)) return word;
  return null;
}

/**
 * Audits CSS: every rule that sets both `color` and `background(-color)` is checked; `var(--x)` is
 * resolved from custom properties declared anywhere in the file. `defaultBackground` also checks
 * rules that only set `color`.
 */
export function auditCss(css: string, options: AuditOptions & { defaultBackground?: string } = {}): PairResult[] {
  const level = options.level ?? "AA";
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const vars: Record<string, string> = {};
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) vars[m[1]] = m[2].trim();
  const resolve = (v: string, depth = 0): string =>
    depth > 10
      ? v
      : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name: string, fb?: string) =>
          resolve(vars[name] ?? fb ?? "", depth + 1),
        );
  const results: PairResult[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split("\n").pop()!.trim();
    if (!selector || selector.startsWith("@")) continue;
    const decls: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
      decls[d[1].toLowerCase()] = resolve(d[2].trim().replace(/\s*!important$/, ""));
    }
    const fg = decls.color ? firstColor(decls.color) : null;
    const bgRaw = decls["background-color"] ?? decls.background;
    const bg = bgRaw ? firstColor(bgRaw) : (options.defaultBackground ?? null);
    if (!fg || !bg || !isColor(fg) || !isColor(bg)) continue;
    const line = clean.slice(0, m.index! + m[0].lastIndexOf(selector)).split("\n").length;
    results.push(check(fg, bg, level, { location: `${selector} (line ${line})` }));
  }
  return results;
}

export interface Confusion {
  a: string;
  b: string;
  deficiency: Deficiency | "normal";
  deltaE: number;
}

/**
 * Colors in a palette that become hard to tell apart for people with color-vision deficiencies —
 * e.g. "success" green and "error" red under deuteranopia. `minDeltaE` is the minimum OKLab ΔE×100.
 */
export function findConfusions(
  palette: Record<string, string>,
  minDeltaE = 12,
  deficiencies: readonly Deficiency[] = ["protanopia", "deuteranopia", "tritanopia"],
): Confusion[] {
  const names = Object.keys(palette);
  const out: Confusion[] = [];
  const r = (x: number) => Math.round(x * 10) / 10;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [palette[names[i]], palette[names[j]]];
      const normal = deltaE(a, b);
      if (normal < minDeltaE) {
        out.push({ a: names[i], b: names[j], deficiency: "normal", deltaE: r(normal) });
        continue;
      }
      for (const d of deficiencies) {
        const e = deltaE(simulate(a, d), simulate(b, d));
        if (e < minDeltaE) out.push({ a: names[i], b: names[j], deficiency: d, deltaE: r(e) });
      }
    }
  }
  return out;
}
