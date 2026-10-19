// Run with node scripts/check-home.cjs; no browser or new dependency required.
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const output = mkdtempSync(join(tmpdir(), "propagent-home-check-"));
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "lib/home-summary.ts", "lib/demo-leads.ts",
  "--outDir", output, "--module", "commonjs", "--target", "ES2017", "--skipLibCheck"],
  { cwd: join(__dirname, ".."), stdio: "inherit" });
const { getHomeSummary, readDemoLeads } = require(join(output, "home-summary.js"));
const { initialDemoLeads } = require(join(output, "demo-leads.js"));
const before = JSON.stringify(initialDemoLeads);
const summary = getHomeSummary(initialDemoLeads);
assert.deepEqual(summary.metrics.map(m => m.value), ["3", "3", "1", "1"]);
assert.equal(summary.actions.length, 2);
assert.equal(JSON.stringify(initialDemoLeads), before, "Reading Home must not mutate leads");
const stopped = initialDemoLeads.map(l => l.id === "ahmed-rahman" ? { ...l, status: "Do not contact" } : l);
assert.equal(getHomeSummary(readDemoLeads(JSON.stringify(stopped))).actions.length, 2, "blocked callback remains visible for review, not permitted outreach");
assert.equal(getHomeSummary(readDemoLeads(JSON.stringify(stopped))).actions.find(a => a.type === "callback").status, "blocked");
const assigned = initialDemoLeads.map(l => l.id === "elena-petrova" ? { ...l, nextAction: "Accept and contact the lead" } : l);
assert.equal(getHomeSummary(assigned).actions.length, 2, "Assignment is not price approval");
const outboundOnly = initialDemoLeads.map(l => ({ ...l, messages: l.messages.filter(m => m.from !== "lead") }));
assert.equal(getHomeSummary(outboundOnly).metrics[1].value, "0", "AI replies do not establish engagement");
assert.deepEqual(getHomeSummary(initialDemoLeads.map(l => ({...l, qualification: undefined, appointments: undefined}))).metrics.slice(2).map(m => m.value), ["—", "—"]);
assert.equal(getHomeSummary(initialDemoLeads.map(l => ({...l, appointments: []}))).metrics[3].value, "0");
assert.equal(getHomeSummary(initialDemoLeads.map(l => ({...l, appointments: l.appointments.map(m => ({...m, status: "cancelled"}))}))).metrics[3].value, "0");
assert.equal(summary.recent.length, 3);
assert.deepEqual(getHomeSummary(readDemoLeads("invalid")).metrics.map(m => m.value), ["—", "—", "—", "—"]);
assert.match(summary.headline, /AI reviewed and qualified 1 lead/);
console.log("PASS: counts, inbound-only engagement, unknown metrics, read-only review, saved suppression and unresolved price review");
