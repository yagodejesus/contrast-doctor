import type { PairResult } from "./audit.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function toMarkdown(results: PairResult[]): string {
  const failed = results.filter((r) => !r.pass).length;
  const rows = results.map((r) => {
    const fix = r.suggestion ? `${r.suggestion.adjust === "background" ? "background" : "text"} \`${r.suggestion.color}\` (${r.suggestion.ratio}:1)` : "";
    return `| ${r.pass ? "✅" : "❌"} | ${esc(r.location ?? "")} | \`${r.foreground}\` on \`${r.background}\` | ${r.ratio}:1 | ${fix} |`;
  });
  return [
    `**${results.length - failed}/${results.length} pairs pass WCAG ${results[0]?.level ?? "AA"}**`,
    "",
    "| | Where | Colors | Contrast | Closest fix |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

export function toHtml(results: PairResult[], title = "Contrast report"): string {
  const failed = results.filter((r) => !r.pass).length;
  const sample = (fg: string, bg: string) => `<span class="swatch" style="color:${fg};background:${bg}">Aa</span>`;
  const rows = results
    .map((r) => {
      const s = r.suggestion;
      const fix = s
        ? (s.adjust === "background" ? sample(r.foreground, s.color) : sample(s.color, r.background)) +
          `<code>${s.color}</code> <small>${s.adjust === "background" ? "background" : "text"} · ${s.ratio}:1 · ΔE ${s.deltaE}</small>`
        : "";
      const pills = (["AA", "AA-large", "AAA", "UI"] as const)
        .map((k) => `<span class="pill ${r[k] ? "y" : "n"}">${k}</span>`)
        .join("");
      return `<tr class="${r.pass ? "ok" : "bad"}"><td>${sample(r.foreground, r.background)}</td><td>${esc(r.location ?? "")}<br><code>${r.foreground}</code> on <code>${r.background}</code></td><td class="n"><strong>${r.ratio}:1</strong></td><td>${pills}</td><td>${fix}</td></tr>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--ink:#1b1530;--soft:#6b6480;--line:#e4e0ee;--paper:#fff;--bg:#f6f4fb;--ok:#0b7a43;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--ink:#ece8f7;--soft:#a69fbd;--line:#2f2a40;--paper:#1a1626;--bg:#110e19;--ok:#5fd394;--bad:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 20px}h1{margin:0 0 4px;font-size:26px}p{color:var(--soft);margin:0 0 20px}
table{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden}
td,th{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left}th{color:var(--soft);font-weight:500}
.n{text-align:right;font-variant-numeric:tabular-nums}code{font-size:13px}small{color:var(--soft)}
.swatch{display:inline-grid;place-items:center;width:48px;height:36px;border-radius:8px;font-weight:700;font-size:17px;margin-right:8px;box-shadow:inset 0 0 0 1px rgba(127,127,127,.25)}
.pill{display:inline-block;font-size:11px;padding:2px 7px;border-radius:99px;margin:0 4px 0 0;border:1px solid}
.pill.y{color:var(--ok);border-color:var(--ok)}.pill.n{color:var(--bad);border-color:var(--bad);opacity:.8}
tr.bad td:nth-child(3){color:var(--bad)}.wrap{overflow-x:auto}
</style></head><body><main><h1>${esc(title)}</h1><p>${results.length - failed} of ${results.length} pairs pass WCAG ${results[0]?.level ?? "AA"}.</p>
<div class="wrap"><table><tr><th></th><th>Pair</th><th class="n">Contrast</th><th>Passes</th><th>Closest fix</th></tr>
${rows}</table></div></main></body></html>`;
}
