// Real component output + controlled clock/storage. Native browser checks are
// separate; importing the small hook host also executes the B1 regression suite.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
let now = Date.parse("2026-10-01T09:00:00Z");
const options = { now: () => now };
const store = storage();
let ui = mount(store, key, options);
const { getHomeSummary, readDemoLeads } = ui.lib("home-summary");
const { sortLeadActivity, describeLeadActivity } = ui.lib("lead-activity");
const saved = () => JSON.parse(store.data.get(key));
const lead = id => saved().find(l => l.id === id);
const recentIds = data => Array.from(getHomeSummary(data).recent, e => e.leadId + "/" + e.id);
const metrics = data => Array.from(getHomeSummary(data).metrics, m => m.value);
const times = view => view.all().filter(n => n.type === "time").map(n => view.text(n));
const activityTitles = view => view.all().filter(n => n.type === "li").map(n => view.text(n));
const homeTitles = view => view.all().filter(n => n.type === "strong").map(n => view.text(n).replace(/\s+:/g, ":")).filter(t => /^(Maya Khan|Ahmed Rahman|Elena Petrova|Daniel Wu):/.test(t));
const home = () => mount(store, key, { ...options, home: true });

// Maya first, Daniel later: sort every lead's events before the Home top three.
ui.click(/^MK Maya Khan/); ui.click("Assign adviser"); ui.click(/Omar Investment/);
const mayaEvent = lead("maya-khan").timelineItems[0];
assert.equal(mayaEvent.recordedAt, "2026-10-01T09:00:00.000Z");
assert.equal(mayaEvent.actor, "user"); assert.ok(mayaEvent.id);
assert.equal(mayaEvent.time, undefined); assert.equal(mayaEvent.occurredAt, undefined);
assert.equal(lead("maya-khan").lastActivity, mayaEvent.recordedAt);
ui.click("Close action", 0);
assert.ok(!ui.button("Schedule callback").props.disabled, "Close re-enables intentional actions without reload");
ui.click("Schedule callback", 0); ui.click(/Tomorrow · 11:30 AM/, 0);
assert.match(ui.status(), /callback tomorrow/); // same timestamp, unique ID
assert.notEqual(lead("maya-khan").timelineItems[0].id, mayaEvent.id);
ui.click("Close action"); ui.click(/^DW Daniel Wu/);
now += 60000;
ui.click("Schedule callback"); ui.click(/Today · 7:30 PM/);
const danielEvent = lead("daniel-wu").timelineItems[0];
assert.equal(danielEvent.recordedAt, "2026-10-01T09:01:00.000Z");
assert.equal(lead("daniel-wu").due, "Today · 7:30 PM", "callback business time unchanged");
assert.equal(getHomeSummary(saved()).recent[0].leadId, "daniel-wu");
assert.deepEqual(metrics(saved()), ["3", "3", "1", "1"], "logging/assign/callback alone do not change dated KPIs");
let h = home();
assert.match(homeTitles(h)[0], /^Daniel Wu: Callback scheduled/);
assert.match(times(h)[0], /Recorded · 1 Oct 2026, 13:01:00 · Dubai \(UTC\+4\) · Just now/);
assert.match(h.text(), /Demo user/);
assert.doesNotMatch(h.text(), /Actor: Appointment Agent|Actor: Omar/);
const order = recentIds(saved());
assert.deepEqual(recentIds([...saved()].reverse()), order, "lead order never breaks ties");
assert.deepEqual(recentIds(saved().map(l => ({ ...l, timelineItems: [...l.timelineItems].reverse() }))), order);
const snapshot = store.data.get(key);
ui = mount(store, key, { ...options, search: "?lead=daniel-wu&tab=activity&mode=sample" });
assert.match(activityTitles(ui)[0], /Callback scheduled.*Demo user.*Recorded/);
assert.equal(times(ui)[0], times(h)[0], "Home and Activity display the same event time");
ui.click("Overview"); ui.click(/^Activity/);
assert.match(activityTitles(ui)[0], /Callback scheduled/);
assert.deepEqual(homeTitles(home()), homeTitles(h), "navigation/remount preserves order");
assert.equal(store.data.get(key), snapshot, "reading and navigation never rewrite events");
now += 120000; h.tick();
assert.match(times(h)[0], /2 min ago/);
assert.equal(store.data.get(key), snapshot, "relative labels are derived, never saved");

// More than three newer actions across multiple leads: the latest three win.
ui.click("Overview"); ui.click(/^AR Ahmed Rahman/);
ui.click("Assign adviser"); ui.click(/Sara Off-plan/); ui.click("Close action");
now += 60000;
ui.click(/^EP Elena Petrova/); ui.click("Follow up later"); ui.click(/Review in 30 days/);
assert.deepEqual(Array.from(getHomeSummary(saved()).recent, e => e.leadId), ["elena-petrova", "ahmed-rahman", "daniel-wu"]);
assert.match(homeTitles(home())[0], /^Elena Petrova: Moved to nurture/);

// Legacy events remain byte-for-byte intact. Invalid legacy timestamp strings
// are unknown; malformed types and invalid NEW recording times remain blocked.
const legacyStore = storage();
const legacy = JSON.parse(JSON.stringify(ui.initialDemoLeads));
legacy.forEach(l => l.timelineItems.forEach((e, i) => {
  delete e.occurredAt; delete e.actor; e.time = "Just now";
  if (i === 0) e.occurredAt = "unparseable legacy time";
}));
const legacyRaw = JSON.stringify(legacy); legacyStore.data.set(key, legacyRaw);
const oldUI = mount(legacyStore, key, { ...options, search: "?lead=maya-khan&tab=activity" });
assert.equal(oldUI.alerts(), "");
assert.equal(times(oldUI).length, 5); assert.ok(times(oldUI).every(t => t === "Time unknown"));
assert.match(oldUI.text(), /Actor not recorded/);
assert.equal(legacyStore.data.get(key), legacyRaw);
const oldHome = mount(legacyStore, key, { ...options, home: true });
assert.ok(times(oldHome).every(t => t === "Time unknown"));
assert.deepEqual(recentIds(legacy), recentIds([...legacy].reverse()));
oldUI.click("Overview"); oldUI.click("Assign adviser"); oldUI.click(/Omar Investment/);
const updatedLegacy = JSON.parse(legacyStore.data.get(key));
assert.equal(updatedLegacy[0].timelineItems.length, 6);
assert.equal(JSON.stringify(updatedLegacy[0].timelineItems.slice(1)), JSON.stringify(legacy[0].timelineItems));
assert.equal(getHomeSummary(readDemoLeads(legacyStore.data.get(key))).recent[0].leadId, "maya-khan");
assert.deepEqual(Array.from(sortLeadActivity(legacy[0].timelineItems), e => e.id), Array.from(sortLeadActivity([...legacy[0].timelineItems].reverse()), e => e.id));
for (const change of [{ recordedAt: "invalid" }, { occurredAt: {} }]) {
  const corrupt = storage(); const bad = JSON.parse(legacyRaw); Object.assign(bad[0].timelineItems[0], change);
  const raw = JSON.stringify(bad); corrupt.data.set(key, raw);
  assert.match(mount(corrupt, key, options).alerts(), /could not be validated/);
  assert.equal(corrupt.data.get(key), raw); assert.ok(corrupt.calls.every(([op]) => op === "get"));
}

// Failed writes publish neither an event nor success. Retry time is the actual
// successful attempt, not a failed action's time; rapid repeats still write once.
const failing = storage(); failing.data.set(key, snapshot);
const retry = mount(failing, key, options); const prior = failing.data.get(key);
retry.click("Schedule callback"); failing.fail = "set"; retry.click(/Tomorrow · 11:30 AM/);
assert.equal(retry.status(), ""); assert.match(retry.alerts(), /Could not save/);
assert.equal(failing.data.get(key), prior); assert.match(retry.text(), /Activity 3/);
assert.match(retry.text(), /Unsubmitted choice/);
now += 60000; failing.fail = ""; retry.click("Retry saving action");
const afterRetry = JSON.parse(failing.data.get(key)).find(l => l.id === "ahmed-rahman");
assert.equal(afterRetry.timelineItems.length, 4); assert.equal(afterRetry.timelineItems[0].recordedAt, new Date(now).toISOString());
const retrySnapshot = failing.data.get(key);
retry.click(/Tomorrow · 11:30 AM/, 2); retry.click("Stop contact", 2);
assert.equal(failing.data.get(key), retrySnapshot); assert.doesNotMatch(retry.text(), /Stop all contact/);
retry.click("Close action", 0); retry.click("Assign adviser", 0); retry.click(/Omar Investment/, 0);
assert.equal(JSON.parse(failing.data.get(key)).find(l => l.id === "ahmed-rahman").timelineItems.length, 5);

// Retain the current action's real KPI effect; do not infer qualification from
// activity. B6's selected Sample D1 contract preserves the meeting on Stop.
const rulesStore = storage(); const rules = mount(rulesStore, key, options);
rules.click(/^MK Maya Khan/); rules.click("Stop contact"); rules.click("Confirm stop");
assert.deepEqual(metrics(JSON.parse(rulesStore.data.get(key))), ["3", "3", "1", "1"]);
assert.match(describeLeadActivity(ui.initialDemoLeads[0].timelineItems[0], now).text, /Sample scenario · 21 Sept 2026/);
console.log("PASS B2: controlled-clock component/Home output, Maya then Daniel, reload/navigation, equal-time IDs and stable ties, global sort before limit, legacy unknown/preservation, no fabricated actor/time, relative clock refresh, B1 failure/retry/double-click/Close-next-action, and unchanged KPI semantics.");
