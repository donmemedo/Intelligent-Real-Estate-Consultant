const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const root = join(__dirname, "..");
const out = mkdtempSync(join(tmpdir(), "agent-journeys-"));
execFileSync(process.execPath, [
  require.resolve("typescript/bin/tsc"),
  "lib/prototype-data.ts",
  "lib/journey-scenarios.ts",
  "--outDir", out,
  "--module", "commonjs",
  "--target", "ES2017",
  "--skipLibCheck",
], { cwd: root, stdio: "inherit" });

const { goldenPath, journeys } = require(join(out, "prototype-data.js"));
const { journeyScenarios } = require(join(out, "journey-scenarios.js"));

assert.equal(journeys.length, 10, "Exactly ten approved journey entry points are required");
assert.deepEqual(Object.keys(journeyScenarios).sort(), journeys.map(journey => journey.id).sort(), "Every journey has one scenario set and no orphan set exists");

for (const journey of journeys) {
  const scenarios = journeyScenarios[journey.id];
  assert.equal(scenarios.length, 4, `${journey.name} has four primary scenarios`);
  assert.deepEqual(scenarios.map(scenario => scenario.title), journey.flows, `${journey.name} cards and workspace scenarios stay aligned`);
  for (const scenario of scenarios) {
    assert.equal(scenario.steps.length, 3, `${journey.name} / ${scenario.title} has a three-step review path`);
    for (const field of ["trigger", "result", "nextOwner", "exception"]) assert.ok(scenario[field].trim(), `${journey.name} / ${scenario.title} has ${field}`);
  }
}

assert.equal(goldenPath.length, 7, "The golden path keeps seven understandable stages");
for (const stage of goldenPath) {
  assert.ok(stage.nextOwner.trim(), `${stage.title} keeps a visible next owner`);
  assert.ok(stage.sharedContext.length >= 3, `${stage.title} shows the shared context carried forward`);
}

console.log("PASS: ten workspaces, forty scenarios and seven cross-agent stages keep results, context and ownership complete");
