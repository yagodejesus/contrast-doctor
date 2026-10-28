import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const ex = (f) => fileURLToPath(new URL(`../examples/${f}`, import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

test("check and fix", () => {
  const ok = run("check", "#111", "#fff");
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /18\.\d+:1/);
  assert.equal(run("check", "#999", "#fff").status, 1);
  assert.match(run("fix", "#8a8a8a", "#fff").stdout, /#767676/);
});

test("audit exit codes and formats", () => {
  assert.equal(run("audit", ex("styles.css")).status, 1);
  const json = JSON.parse(run("audit", ex("tokens.json"), "--json").stdout);
  assert.ok(Array.isArray(json) && json.length > 0);
  assert.match(run("audit", ex("tokens.json"), "--markdown").stdout, /\| ❌ \|/);
});

test("confusions, simulate, help and errors", () => {
  assert.equal(run("confusions", ex("status-colors.json")).status, 1);
  assert.match(run("simulate", "#e53935").stdout, /deuteranopia/);
  assert.match(run("--help").stdout, /Usage/);
  assert.equal(run("check", "nope", "#fff").status, 2);
});
