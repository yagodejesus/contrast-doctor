import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio, deltaE, parseColor, simulate, toHex, toOklch } from "../dist/index.js";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("WCAG reference values", () => {
  close(contrastRatio("#000", "#fff"), 21);
  close(contrastRatio("#777777", "#ffffff"), 4.48);
  close(contrastRatio("#767676", "#ffffff"), 4.54);
  close(contrastRatio("#fff", "#fff"), 1);
  assert.equal(contrastRatio("#123", "#fed"), contrastRatio("#fed", "#123"));
});

test("parses every common syntax", () => {
  assert.equal(toHex("#abc"), "#aabbcc");
  assert.equal(toHex("rgb(255, 0, 0)"), "#ff0000");
  assert.equal(toHex("rgb(100% 0% 0%)"), "#ff0000");
  assert.equal(toHex("hsl(210 50% 40%)"), "#336699");
  assert.equal(toHex("hsla(0, 100%, 50%, 0.5)"), "#ff000080");
  assert.equal(toHex("rebeccapurple"), "#663399");
  assert.equal(toHex("oklch(0.627955 0.257683 29.2339)"), "#ff0000");
  assert.equal(toHex("oklch(62.8% 0.2577 29.23)"), "#ff0000");
  assert.throws(() => parseColor("not-a-color"), /Unrecognized/);
  assert.throws(() => parseColor("#12345"), /Invalid hex/);
});

test("OKLCH round trip", () => {
  for (const hex of ["#7c3aed", "#22c55e", "#0f766e", "#f59e0b", "#111827"]) {
    const { l, c, h } = toOklch(hex);
    assert.equal(toHex(`oklch(${l} ${c} ${h})`), hex);
  }
});

test("translucent text is composited over the background", () => {
  close(contrastRatio("rgba(0,0,0,0.5)", "#fff"), contrastRatio("#808080", "#fff"), 0.05);
});

test("deltaE and color-vision simulation", () => {
  assert.equal(deltaE("#336699", "#336699"), 0);
  assert.ok(deltaE("#ff0000", "#00ff00") > 50);
  const gray = simulate("#e53935", "achromatopsia");
  assert.ok(gray.r === gray.g && gray.g === gray.b);
  assert.ok(deltaE(simulate("#43a047", "deuteranopia"), simulate("#e53935", "deuteranopia")) < 6);
});
