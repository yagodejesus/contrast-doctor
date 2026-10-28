#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import {
  auditCss,
  auditTokens,
  checkPair,
  DEFICIENCIES,
  findConfusions,
  fixContrast,
  simulate,
  toHex,
  toHtml,
  toMarkdown,
  VERSION,
  type Level,
  type PairResult,
} from "./index.js";

const HELP = `contrast-doctor ${VERSION} — find and fix low-contrast colors (WCAG 2.2)

Usage:
  contrast-doctor check <fg> <bg> [--level AA]              contrast ratio and what it passes
  contrast-doctor fix <fg> <bg> [--level AA] [--bg]         closest accessible color (--bg: change the background)
  contrast-doctor audit <file.css|tokens.json> [options]    audit a stylesheet or design tokens
  contrast-doctor simulate <color...>                       how colors look with color-vision deficiencies
  contrast-doctor confusions <palette.json> [--min 12]      colors that become indistinguishable

Audit options:
  --level AA|AA-large|AAA|AAA-large|UI   requirement to check (default AA)
  --pairs text:bg,muted:surface          token pairs (default: text-like × background-like tokens)
  --background <color>                   assume this background for CSS rules that only set color
  --json | --markdown | --html <file>    output format

Colors: #hex, rgb(), hsl(), oklch() or CSS names. Exit code 1 when something fails.
`;

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const swatch = (hex: string) =>
  COLOR ? `\x1b[48;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m   \x1b[0m ` : "";

function printPair(r: PairResult): void {
  const mark = r.pass ? paint("32", "✓") : paint("31", "✗");
  const where = r.location ? `${r.location}  ` : "";
  console.log(`${mark} ${where}${swatch(r.foreground)}${r.foreground} on ${swatch(r.background)}${r.background}  ${paint("1", `${r.ratio}:1`)}`);
  if (r.suggestion) {
    const side = r.suggestion.adjust === "background" ? "background" : "text";
    console.log(`    → closest fix: ${side} ${swatch(r.suggestion.color)}${r.suggestion.color} (${r.suggestion.ratio}:1, ΔE ${r.suggestion.deltaE})`);
  }
}

function main(argv: string[]): number {
  const args = [...argv];
  const take = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  if (flag("--version") || flag("-v")) {
    console.log(VERSION);
    return 0;
  }
  if (!args.length || flag("--help") || flag("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  const level = (take("--level") ?? "AA") as Level;
  const html = take("--html");
  const pairsArg = take("--pairs");
  const background = take("--background");
  const min = Number(take("--min") ?? 12);
  const json = flag("--json");
  const markdown = flag("--markdown");
  const adjustBg = flag("--bg");
  const [cmd, ...rest] = args;

  if (cmd === "check" || cmd === "fix") {
    if (rest.length < 2) throw new Error(`usage: contrast-doctor ${cmd} <fg> <bg>`);
    if (cmd === "fix") {
      const f = fixContrast(rest[0], rest[1], { target: level, adjust: adjustBg ? "background" : "foreground" });
      if (json) console.log(JSON.stringify(f, null, 2));
      else console.log(f.changed ? `${swatch(f.color)}${f.color}  (${f.ratio}:1, ${f.direction}, ΔE ${f.deltaE})` : `${f.color} already passes (${f.ratio}:1)`);
      return 0;
    }
    const r = checkPair(rest[0], rest[1], level);
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      printPair(r);
      const levels = ["AA", "AA-large", "AAA", "AAA-large", "UI"] as const;
      console.log(`    ${levels.map((k) => `${r[k] ? paint("32", "●") : paint("31", "○")} ${k}`).join("  ")}`);
    }
    return r.pass ? 0 : 1;
  }

  if (cmd === "simulate") {
    for (const c of rest) {
      const cells = DEFICIENCIES.map((d) => `${d}: ${swatch(toHex(simulate(c, d)))}${toHex(simulate(c, d))}`);
      console.log(`${swatch(toHex(c))}${toHex(c)}  ${cells.join("  ")}`);
    }
    return 0;
  }

  if (cmd === "audit" || cmd === "confusions") {
    const file = rest[0];
    if (!file) throw new Error(`usage: contrast-doctor ${cmd} <file>`);
    const text = readFileSync(file, "utf8");
    if (cmd === "confusions") {
      const found = findConfusions(JSON.parse(text), min);
      if (json) console.log(JSON.stringify(found, null, 2));
      else if (!found.length) console.log(paint("32", "✓ every pair of colors stays distinguishable"));
      else for (const c of found) console.log(`${paint("31", "✗")} ${c.a} ↔ ${c.b}: ΔE ${c.deltaE} (${c.deficiency})`);
      return found.length ? 1 : 0;
    }
    const pairs = pairsArg?.split(",").map((p) => p.split(":") as [string, string]);
    const results = file.endsWith(".json")
      ? auditTokens(JSON.parse(text), { level, pairs })
      : auditCss(text, { level, defaultBackground: background });
    const failed = results.filter((r) => !r.pass).length;
    if (html) writeFileSync(html, toHtml(results, `Contrast report — ${file}`));
    if (json) console.log(JSON.stringify(results, null, 2));
    else if (markdown) console.log(toMarkdown(results));
    else {
      results.forEach(printPair);
      console.log(`\n${results.length - failed}/${results.length} pairs pass WCAG ${level}${html ? ` · report: ${html}` : ""}`);
    }
    return failed ? 1 : 0;
  }
  throw new Error(`unknown command: ${cmd} (see --help)`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`contrast-doctor: ${(e as Error).message}`);
  process.exitCode = 2;
}
