const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const out = mkdtempSync(join(tmpdir(), "leads-states-"));
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "lib/leads-state.ts", "--outDir", out, "--module", "commonjs", "--target", "ES2017", "--skipLibCheck"], { cwd: join(__dirname, ".."), stdio: "inherit" });
const { resolveLeadsState, previewLeadsState } = require(join(out, "leads-state.js"));
assert.equal(resolveLeadsState(false, 0), "empty");
assert.equal(resolveLeadsState(false, 2), "operational");
assert.equal(resolveLeadsState(false, 2, true), "error");
assert.equal(resolveLeadsState(true, 2, true), "sample");
for (const state of ["empty", "operational", "sample", "error"]) {
  assert.equal(previewLeadsState(state, false), null);
  assert.equal(previewLeadsState(state, true), state);
}
assert.equal(previewLeadsState("invalid", true), null);
console.log("PASS: lead state priority and development preview isolation");
