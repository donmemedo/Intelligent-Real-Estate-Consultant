const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const out = mkdtempSync(join(tmpdir(), "home-states-"));
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "lib/home-state.ts", "--outDir", out, "--module", "commonjs", "--target", "ES2017", "--skipLibCheck"], { cwd: join(__dirname, ".."), stdio: "inherit" });
const { resolveHomeState, previewHomeState, getSetupReadiness, getPrototypeWorkspace } = require(join(out, "home-state.js"));
for (const sample of [false, true]) for (const leads of [0, 1]) for (const complete of [false, true]) {
  assert.equal(resolveHomeState(sample, { realLeadCount: leads, requiredSetupComplete: complete, checks: [] }),
    sample ? "sample" : leads ? "operational" : complete ? "ready" : "onboarding");
}
for (const state of ["onboarding", "ready", "operational", "sample"]) assert.equal(previewHomeState(state), state);
assert.equal(previewHomeState("invalid"), null);
const empty = { selected: 0, completed: [], values: {} };
assert.equal(getSetupReadiness(empty).next, "agency");
assert.equal(getSetupReadiness(empty).count, 0);
assert.equal(getSetupReadiness(empty).groups.length, 4);
const ids = ["agency", "source", "crm", "whatsapp", "knowledge", "routing", "test"];
const complete = { selected: 7, completed: ids, values: Object.fromEntries(ids.map(id => [id, "configured"])) };
const before = JSON.stringify(complete);
assert.equal(resolveHomeState(false, getPrototypeWorkspace(complete)), "ready");
assert.equal(getPrototypeWorkspace(complete).realLeads.length, 0);
const invalid = { ...complete, values: { ...complete.values, routing: "" } };
assert.equal(getSetupReadiness(invalid).requiredSetupComplete, false);
assert.equal(getSetupReadiness(invalid).groups.find(g => g.title === "Human handoff").status, "Needs attention");
assert.equal(getSetupReadiness(invalid).next, "routing");
assert.equal(JSON.stringify(complete), before);
console.log("PASS: all resolver combinations, three-state prototype review, setup mapping, validation and nonmutation");
