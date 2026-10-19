// B7 targeted component tests. Browser/cache/scroll checks are separate.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
const options = { search: "?mode=sample&lead=maya-khan&tab=overview" };
const s = storage(); let ui = mount(s, key, options);
const { describeNextAction, describeNextActionDue } = ui.lib("lead-handoff");
const { planMeetingDecision } = ui.lib("lead-meetings");
const { reviewHash, leadLocationHref } = ui.lib("lead-location");
const seed = JSON.stringify(ui.initialDemoLeads);
const maya = () => JSON.parse(s.data.get(key))[0];
assert.match(ui.text(), /Attend the confirmed property consultation/);
ui.click("Review cancellation"); s.fail = "set"; ui.click("Confirm cancel meeting");
assert.equal(s.data.has(key), false);
assert.match(ui.text(), /Attend the confirmed property consultation/);
assert.equal(ui.status(), "");
s.fail = ""; ui.click("Retry saving action", 0);
assert.equal(maya().timelineItems.length, 6);
assert.equal(maya().nextActionContext.meetingId, "maya-meeting-1");
assert.equal(maya().nextAction, "Attend the confirmed property consultation", "preserve original text as evidence");
assert.equal(describeNextAction(maya()), "No current action · linked meeting cancelled");
assert.equal(describeNextActionDue(maya()), "No current action deadline");
ui.click("Confirm cancel meeting", 2);
assert.equal(maya().timelineItems.length, 6);
const saved = s.data.get(key); ui = mount(s, key, options);
assert.match(ui.text(), /No current action · linked meeting cancelled/);
assert.equal(s.data.get(key), saved);

// Callback and independent nurture explicitly replace the old meeting link.
for (const choice of ["callback", "nurture"]) {
  const store = storage(); const v = mount(store, key, options);
  v.click(choice === "callback" ? "Schedule callback" : "Follow up later");
  v.click(choice === "callback" ? /Tomorrow · 11:30 AM/ : /Review in 30 days/);
  v.click("Close action");
  const before = JSON.parse(store.data.get(key))[0];
  v.click("Review cancellation"); v.click("Confirm cancel meeting");
  const after = JSON.parse(store.data.get(key))[0];
  assert.equal(after.nextActionContext.kind, "independent");
  assert.equal(describeNextAction(after), before.nextAction);
  assert.equal(after.due, before.due);
  assert.equal(JSON.stringify(after.tasks), JSON.stringify(before.tasks));
}
const two = JSON.parse(seed)[0];
two.appointments.push({ ...two.appointments[0], id: "second-meeting" });
two.nextActionContext = { kind: "meeting", meetingId: "second-meeting" };
const plan = planMeetingDecision(two, { kind: "cancel-meeting", meetingId: "maya-meeting-1" });
assert.equal(plan.kind, "change");
assert.equal(describeNextAction({ ...two, ...plan.update }), two.nextAction);
assert.equal(plan.update.appointments[1].status, "confirmed");

// Old plans have no proven linkage; do not infer from words or rewrite on read.
for (const status of ["confirmed", "cancelled"]) {
  const legacy = JSON.parse(seed); delete legacy[0].nextActionContext;
  legacy[0].appointments[0].status = status;
  const store = storage(); const raw = JSON.stringify(legacy); store.data.set(key, raw);
  const v = mount(store, key, options);
  assert.match(v.text(), /Previous plan · needs review: Attend the confirmed property consultation/);
  assert.match(v.text(), /Previous timing/);
  assert.equal(store.data.get(key), raw);
  assert.ok(store.calls.every(([op]) => op === "get"));
}
const independent = { ...JSON.parse(seed)[0], nextAction: "Attend meeting", nextActionContext: { kind: "independent" } };
assert.equal(describeNextAction({ ...independent, appointments: [{ ...independent.appointments[0], status: "cancelled" }] }), "Attend meeting");
for (const context of [{ kind: "meeting", meetingId: "" }, { kind: "unknown" }]) {
  const bad = JSON.parse(seed); bad[0].nextActionContext = context;
  const store = storage(); const raw = JSON.stringify(bad); store.data.set(key, raw);
  assert.match(mount(store, key, options).alerts(), /could not be validated/);
  assert.equal(store.data.get(key), raw);
}

// Single final review anchor, exact query and one history entry; no business writes.
const query = "mode=sample&preview=sample&state=sample&lead=maya-khan&tab=overview&q=Maya";
for (const hash of ["#home-review#home-review", "#home-review#meeting-maya-meeting-1#meeting-maya-meeting-1"]) {
  const expected = hash.slice(hash.lastIndexOf("#"));
  assert.equal(reviewHash(hash), expected);
  const store = storage(); const v = mount(store, key, { search: "?" + query + hash });
  assert.equal(v.url(), "/leads?" + query + expected);
  assert.equal(v.history().length, 1);
  v.click(/^Activity/); v.back(); v.forward();
  assert.equal(new URL(v.url(), "http://localhost").hash, expected);
  assert.ok(store.calls.every(([op]) => op === "get"));
}
assert.equal(reviewHash("#unrelated#unknown"), "#unrelated#unknown");
const home = mount(storage(), key, { home: true, search: "?" + query });
const link = home.all().find(n => n.type === "a" && home.text(n) === "Review property price").props.href;
const parsed = new URL(link, "http://localhost");
for (const param of ["mode", "preview", "state"]) assert.equal(parsed.searchParams.get(param), "sample");
assert.equal(parsed.searchParams.get("q"), "Maya");
assert.equal(parsed.searchParams.get("lead"), "elena-petrova"); assert.equal(parsed.hash, "#home-review");
assert.equal(leadLocationHref("/leads", query, { lead: "maya-khan", tab: "activity", q: "Maya" }, "#home-review").split("#").length, 2);

// Real guided component output, including Undo/restart and both source-check entries.
const demo = () => mount(storage(), key, { guided: true });
const choose = (v, prefix) => v.click(new RegExp("^" + prefix));
let d = demo(); choose(d, "Reply on WhatsApp"); choose(d, "Verify before answering");
assert.match(d.text(), /Source check simulated.*availability remains unknown/);
assert.match(d.text(), /Choose how to use the sample answer/);
assert.doesNotMatch(d.text(), /Verify the payment plan/);
choose(d, "Answer and suggest"); choose(d, "Review one illustrative property");
assert.match(d.text(), /One illustrative property.*Explore Hills Park/);
assert.doesNotMatch(d.text(), /[Tt]hree/);
choose(d, "Maya wants cheaper"); assert.match(d.text(), /search continues with the revised budget.*Refresh the shortlist/);
d.click("Undo last choice"); assert.match(d.text(), /Explore Hills Park/);
d.click("Start again"); choose(d, "Reply on WhatsApp"); choose(d, "Answer from the advertisement"); choose(d, "Check approved sources");
assert.match(d.text(), /Choose how to use the sample answer/);
assert.doesNotMatch(d.text(), /Resolve the unsafe answer/);
d = demo(); choose(d, "Try a voice call"); choose(d, "Simulate an approved call"); choose(d, "No answer"); choose(d, "Schedule another call");
assert.match(d.text(), /lead stays in active follow-up/); assert.match(d.text(), /Call tomorrow at 11:30 AM/);
assert.doesNotMatch(d.text(), /not left in active follow-up/);
assert.match(d.text(), /21 Sep 2026, Dubai/);
console.log("PASS B7: linked cancellation vs independent/other-meeting plans; legacy nonmutation; save failure/retry; review hash/query/history; guided story branches/source/ending; B1 retained.");
