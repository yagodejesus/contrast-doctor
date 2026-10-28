import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { auditCss, auditTokens, findConfusions, flattenTokens, toHtml, toMarkdown } from "../dist/index.js";

const tokens = JSON.parse(readFileSync(new URL("../examples/tokens.json", import.meta.url)));

test("flattens W3C tokens and resolves references", () => {
  const flat = flattenTokens(tokens);
  assert.equal(flat["color.link"], "#7c3aed");
  assert.equal(flat["color.background"], "#ffffff");
});

test("audits text-like tokens against background-like tokens", () => {
  const results = auditTokens(tokens);
  const muted = results.find((r) => r.location === "color.text-muted on color.background");
  assert.equal(muted.pass, false);
  assert.ok(muted.suggestion.ratio >= 4.5);
  assert.ok(results.find((r) => r.location === "color.text on color.background").pass);
  assert.ok(results.every((r) => !r.location.startsWith("color.background on")));
});

test("explicit pairs and unknown tokens", () => {
  const [r] = auditTokens({ ink: "#333", paper: "#fff" }, { pairs: [["ink", "paper"]], level: "AAA" });
  assert.equal(r.pass, true);
  assert.throws(() => auditTokens({ a: "#000" }, { pairs: [["a", "b"]] }), /Unknown token/);
});

test("audits CSS with variables, comments and line numbers", () => {
  const css = readFileSync(new URL("../examples/styles.css", import.meta.url), "utf8");
  const results = auditCss(css);
  assert.deepEqual(
    results.map((r) => [r.location, r.pass]),
    [["button (line 5)".replace("button", ".button"), true], [".hint (line 7)", false], [".badge (line 8)", false]],
  );
});

test("default background for rules that only set color", () => {
  assert.equal(auditCss("p { color: #aaa }").length, 0);
  assert.equal(auditCss("p { color: #aaa }", { defaultBackground: "#fff" })[0].pass, false);
});

test("finds status colors that color-blind users can't tell apart", () => {
  const found = findConfusions({ success: "#43a047", error: "#e53935", info: "#1e88e5" });
  assert.ok(found.some((c) => c.a === "success" && c.b === "error" && c.deficiency === "deuteranopia"));
  assert.ok(found.every((c) => c.deficiency !== "achromatopsia"));
  assert.deepEqual(findConfusions({ black: "#000", white: "#fff" }), []);
});

test("markdown and html reports", () => {
  const results = auditTokens(tokens);
  assert.match(toMarkdown(results), /pairs pass WCAG AA/);
  const html = toHtml(results);
  assert.ok(html.startsWith("<!doctype html>") && html.includes("Closest fix"));
});
