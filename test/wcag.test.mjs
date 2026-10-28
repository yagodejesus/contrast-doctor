import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio, fixContrast, grade, toOklch } from "../dist/index.js";

test("grade reports every level", () => {
  const g = grade("#777", "#fff");
  assert.equal(g.ratio, 4.48);
  assert.deepEqual([g.AA, g["AA-large"], g.AAA, g.UI], [false, true, false, true]);
});

test("fix finds the classic #767676 for gray on white", () => {
  const f = fixContrast("#8a8a8a", "#ffffff");
  assert.equal(f.color, "#767676");
  assert.equal(f.direction, "darker");
});

test("fix keeps the hue and reaches the target", () => {
  for (const [fg, bg, target] of [["#a78bfa", "#ffffff", "AA"], ["#22c55e", "#ffffff", "AA"], ["#7c3aed", "#0b0b1a", "AAA"]]) {
    const f = fixContrast(fg, bg, { target });
    assert.ok(contrastRatio(f.color, bg) >= (target === "AAA" ? 7 : 4.5), `${fg} → ${f.color}`);
    const dh = Math.abs(toOklch(f.color).h - toOklch(fg).h);
    assert.ok(Math.min(dh, 360 - dh) < 8, `hue drifted for ${fg}`);
  }
});

test("dark backgrounds get lighter text", () => {
  const f = fixContrast("#4b5563", "#111827");
  assert.equal(f.direction, "lighter");
  assert.ok(contrastRatio(f.color, "#111827") >= 4.5);
});

test("can adjust the background instead", () => {
  const f = fixContrast("#ffffff", "#22c55e", { adjust: "background" });
  assert.ok(contrastRatio("#ffffff", f.color) >= 4.5);
});

test("already passing colors are returned unchanged", () => {
  const f = fixContrast("#111827", "#ffffff");
  assert.equal(f.changed, false);
  assert.equal(f.color, "#111827");
});

test("numeric targets", () => {
  const f = fixContrast("#999", "#fff", { target: 3 });
  assert.ok(f.ratio >= 3 && f.ratio < 3.3);
});
