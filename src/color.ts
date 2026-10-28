/** Color parsing, conversion (sRGB ⇄ OKLab/OKLCH), WCAG contrast and color-vision simulation. */

export interface RGBA {
  /** sRGB channels and alpha, 0–1. */
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface OKLCH {
  l: number;
  c: number;
  h: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080",
  silver: "#c0c0c0", maroon: "#800000", olive: "#808000", lime: "#00ff00", navy: "#000080", purple: "#800080",
  teal: "#008080", orange: "#ffa500", rebeccapurple: "#663399", darkgray: "#a9a9a9", darkgrey: "#a9a9a9",
  lightgray: "#d3d3d3", lightgrey: "#d3d3d3", whitesmoke: "#f5f5f5", gold: "#ffd700", pink: "#ffc0cb",
  brown: "#a52a2a", coral: "#ff7f50", crimson: "#dc143c", tomato: "#ff6347", indigo: "#4b0082", violet: "#ee82ee",
  salmon: "#fa8072", beige: "#f5f5dc", ivory: "#fffff0", khaki: "#f0e68c", tan: "#d2b48c", chocolate: "#d2691e",
  darkblue: "#00008b", darkgreen: "#006400", darkred: "#8b0000", lightblue: "#add8e6", lightgreen: "#90ee90",
  dimgray: "#696969", slategray: "#708090", steelblue: "#4682b4", royalblue: "#4169e1", dodgerblue: "#1e90ff",
  forestgreen: "#228b22", seagreen: "#2e8b57", firebrick: "#b22222", goldenrod: "#daa520", darkorange: "#ff8c00",
  orangered: "#ff4500", hotpink: "#ff69b4", deeppink: "#ff1493", plum: "#dda0dd", orchid: "#da70d6",
  turquoise: "#40e0d0", skyblue: "#87ceeb", midnightblue: "#191970", gainsboro: "#dcdcdc", linen: "#faf0e6",
  snow: "#fffafa", honeydew: "#f0fff0", mintcream: "#f5fffa", azure: "#f0ffff", aliceblue: "#f0f8ff",
  lavender: "#e6e6fa", transparent: "#00000000",
};

export const NAMED_COLORS: readonly string[] = Object.keys(NAMED);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const channel = (v: string, max: number) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / max);

function hue(v: string): number {
  const n = parseFloat(v);
  if (v.endsWith("turn")) return n * 360;
  if (v.endsWith("grad")) return n * 0.9;
  if (v.endsWith("rad")) return (n * 180) / Math.PI;
  return n;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Parses #rgb, #rrggbbaa, rgb(), hsl(), oklch() and CSS named colors. Throws on anything else. */
export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  if (s in NAMED) return parseColor(NAMED[s]);
  const hex = /^#([0-9a-f]+)$/.exec(s);
  if (hex) {
    const h = hex[1];
    if (![3, 4, 6, 8].includes(h.length)) throw new Error(`Invalid hex color: ${input}`);
    const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 };
  }
  const fn = /^(rgba?|hsla?|oklch)\((.*)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].replace(/\//g, " / ").split(/[\s,]+/).filter(Boolean);
    let alpha = 1;
    let vals = parts;
    const slash = parts.indexOf("/");
    if (slash >= 0) {
      alpha = channel(parts[slash + 1], 1);
      vals = parts.slice(0, slash);
    } else if (parts.length === 4) {
      alpha = channel(parts[3], 1);
      vals = parts.slice(0, 3);
    }
    if (vals.length !== 3 || vals.some((v) => Number.isNaN(parseFloat(v)))) throw new Error(`Invalid color: ${input}`);
    if (fn[1].startsWith("rgb")) {
      return { r: channel(vals[0], 255), g: channel(vals[1], 255), b: channel(vals[2], 255), a: clamp01(alpha) };
    }
    if (fn[1].startsWith("hsl")) {
      const [r, g, b] = hslToRgb(hue(vals[0]), channel(vals[1], 100), channel(vals[2], 100));
      return { r, g, b, a: clamp01(alpha) };
    }
    const l = vals[0].endsWith("%") ? parseFloat(vals[0]) / 100 : parseFloat(vals[0]);
    const c = vals[1].endsWith("%") ? (parseFloat(vals[1]) / 100) * 0.4 : parseFloat(vals[1]);
    return fromOklch({ l, c, h: hue(vals[2]), a: clamp01(alpha) });
  }
  throw new Error(`Unrecognized color: ${input}`);
}

export const toRGBA = (c: RGBA | string): RGBA => (typeof c === "string" ? parseColor(c) : c);

export function toHex(color: RGBA | string): string {
  const { r, g, b, a } = toRGBA(color);
  const x = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}${a < 1 ? x(a) : ""}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toOklab(color: RGBA | string): [number, number, number] {
  const c = toRGBA(color);
  return linearToOklab(toLinear(c.r), toLinear(c.g), toLinear(c.b));
}

export function toOklch(color: RGBA | string): OKLCH {
  const c = toRGBA(color);
  const [l, a, b] = toOklab(c);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h, a: c.a };
}

/** OKLCH → sRGB, reducing chroma (keeping lightness and hue) when the color is outside the sRGB gamut. */
export function fromOklch({ l, c, h, a }: OKLCH): RGBA {
  const rad = (h * Math.PI) / 180;
  const lin = (chroma: number) => oklabToLinear(l, chroma * Math.cos(rad), chroma * Math.sin(rad));
  const inGamut = (chroma: number) => lin(chroma).every((v) => v >= -1e-5 && v <= 1 + 1e-5);
  let chroma = c;
  if (!inGamut(chroma)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  const [r, g, b] = lin(chroma).map((v) => toGamma(clamp01(v)));
  return { r, g, b, a };
}

/** Composites a (possibly translucent) color over a background (translucent backgrounds sit on white). */
export function over(fg: RGBA, bg: RGBA): RGBA {
  const base = bg.a < 1 ? over(bg, { r: 1, g: 1, b: 1, a: 1 }) : bg;
  return {
    r: fg.r * fg.a + base.r * (1 - fg.a),
    g: fg.g * fg.a + base.g * (1 - fg.a),
    b: fg.b * fg.a + base.b * (1 - fg.a),
    a: 1,
  };
}

/** WCAG 2 relative luminance. */
export function luminance(color: RGBA | string): number {
  const c = toRGBA(color);
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2 contrast ratio (1–21) of text color `fg` on background `bg`. */
export function contrastRatio(fg: RGBA | string, bg: RGBA | string): number {
  const b = toRGBA(bg);
  const base = b.a < 1 ? over(b, { r: 1, g: 1, b: 1, a: 1 }) : b;
  const f = over(toRGBA(fg), base);
  const [hi, lo] = [luminance(f), luminance(base)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Perceptual difference in OKLab, scaled ×100 (≈2 is barely noticeable, >10 is clearly different). */
export function deltaE(a: RGBA | string, b: RGBA | string): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

export type Deficiency = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";
export const DEFICIENCIES: readonly Deficiency[] = ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"];

// Machado, Oliveira & Fernandes (2009), severity 1.0 — applied in linear RGB.
const MACHADO: Record<Exclude<Deficiency, "achromatopsia">, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** How a color looks to someone with the given color-vision deficiency. */
export function simulate(color: RGBA | string, deficiency: Deficiency): RGBA {
  const c = toRGBA(color);
  const lin = [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
  if (deficiency === "achromatopsia") {
    const g = toGamma(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]);
    return { r: g, g, b: g, a: c.a };
  }
  const m = MACHADO[deficiency];
  const out = m.map((row) => toGamma(clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
  return { r: out[0], g: out[1], b: out[2], a: c.a };
}
