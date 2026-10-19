// B5: observable component/Home output with controlled storage and clock.
// Native browser interaction is tested separately; this is not a DOM test.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
let now = Date.parse("2026-10-02T10:00:00Z");
const options = { search: "?lead=maya-khan&mode=sample", now: () => now };
const store = storage(); let ui = mount(store, key, options);
const { getHomeSummary } = ui.lib("home-summary");
const { readLeadStorage } = ui.lib("lead-storage");
const { planHandoff } = ui.lib("lead-handoff");
const read = (s = store) => readLeadStorage(() => s, key, ui.initialDemoLeads).leads;
const lead = (id = "maya-khan", s = store) => read(s).find(l => l.id === id);
const events = (id = "maya-khan", s = store) => lead(id, s).timelineItems.length;
const summary = (s = store) => getHomeSummary(read(s));
const metrics = (s = store) => Array.from(summary(s).metrics, m => m.value);
const home = (s = store) => mount(s, key, { home: true, search: "?mode=sample&preview=sample" });
const count = (s, expected) => {
  const h = home(s); assert.equal(h.all().find(n => n.props.className === "count-badge").props.children, expected);
  assert.equal(h.all().filter(n => n.type === "article" && h.text(n).includes("Task:")).length, expected);
};
const request = (view, adviser = "Omar") => { view.click("Assign adviser"); view.click(new RegExp(`^${adviser} (Investment|Off-plan)`)); };
const accept = (view, adviser = "Omar") => { view.click("Review simulated acceptance"); view.click(`Simulate acceptance by ${adviser}`, 0); };
const backToAI = view => { view.click("Review return to AI"); view.click("Confirm return to AI in sample", 0); };
const seedMeeting = JSON.stringify(lead().appointments);
count(store, 2);
assert.ok(read().every(l => !l.response?.handoff));
assert.equal(lead("elena-petrova").status, "Waiting for adviser");
assert.equal(store.data.has(key), false, "Waiting and Review never seed handoffs");

// Request is not acceptance. The same owner, meeting and KPIs survive each step.
ui.click("Assign adviser"); const choose = ui.button(/^Omar Investment/).props.onClick;
choose(); choose(); ui.flush();
assert.equal(events(), 6); assert.equal(store.calls.filter(([op]) => op === "set").length, 1);
assert.equal(lead().owner, "Omar · Investment adviser");
assert.equal(lead().response.state, "paused"); assert.equal(lead().response.handoff.status, "requested");
const taskId = lead().response.handoff.id;
assert.equal(lead().tasks.filter(t => t.type === "handoff").length, 1); count(store, 3);
assert.equal(JSON.stringify(lead().appointments), seedMeeting); assert.deepEqual(metrics(), ["3", "3", "1", "1"]);
assert.match(ui.text(), /Lead owner: Omar.*Response control: Paused.*Awaiting acceptance.*Omar/);
assert.match(ui.text(), /Meeting owner: Sara.*Meeting ID: maya-meeting-1/);
const pendingSnapshot = store.data.get(key);
ui.click(/^Omar Investment/, 2); ui.click("Stop contact", 2);
assert.equal(store.data.get(key), pendingSnapshot); assert.doesNotMatch(ui.text(), /Stop all contact/);
ui.click("Close action", 0); ui.click("Review simulated acceptance");
assert.match(ui.text(), /Demo user will simulate.*not a signed-in adviser/);
ui.click("Cancel"); now += 86400000; ui.tick();
ui = mount(store, key, options); count(store, 3);
assert.equal(store.data.get(key), pendingSnapshot, "review, elapsed time and reload are read-only");
const link = home().all().find(n => n.type === "a" && home().text(n) === "Review handoff");
assert.match(link.props.href, /mode=sample/); assert.match(link.props.href, /preview=sample/); assert.match(link.props.href, /lead=maya-khan/);
request(ui); assert.equal(store.data.get(key), pendingSnapshot); assert.match(ui.status(), /Nothing was changed/);
ui.click("Close action"); accept(ui);
assert.equal(lead().response.state, "human"); assert.equal(lead().response.handoff.status, "accepted");
assert.equal(lead().tasks.find(t => t.id === taskId).status, "completed"); count(store, 2);
assert.equal(events(), 7); assert.equal(lead().timelineItems[0].actor, "user");
assert.equal(lead().timelineItems[0].recordedAt, new Date(now).toISOString());
assert.match(lead().timelineItems[0].detail, /Demo user simulated acceptance by Omar/);
assert.match(ui.text(), /Human · Omar · acceptance simulated/);
assert.equal(JSON.stringify(lead().appointments), seedMeeting); assert.deepEqual(metrics(), ["3", "3", "1", "1"]);
ui.click("Close action"); const acceptedSnapshot = store.data.get(key);
request(ui); assert.equal(store.data.get(key), acceptedSnapshot, "same request after acceptance is idempotent");
ui.click("Close action"); ui.click("Review return to AI"); ui.click("Cancel");
ui = mount(store, key, options); assert.equal(store.data.get(key), acceptedSnapshot);
backToAI(ui); assert.equal(lead().response.state, "ai"); assert.equal(lead().response.handoff.status, "returned");
assert.equal(events(), 8); count(store, 2); assert.equal(lead().owner, "Omar · Investment adviser");
assert.equal(JSON.stringify(lead().appointments), seedMeeting);
ui.click("Close action"); request(ui); // An explicit new cycle after return is allowed.
assert.equal(lead().response.handoff.id, taskId); count(store, 3);
ui.click("Close action"); accept(ui); ui.click("Close action"); request(ui, "Sara");
assert.equal(lead().response.state, "paused"); assert.equal(lead().response.handoff.status, "requested");
assert.equal(lead().response.handoff.target, "sara"); assert.equal(lead().response.handoff.id, taskId); count(store, 3);
assert.equal(planHandoff(lead(), { kind: "accept", id: taskId, target: "omar" }).kind, "blocked");
assert.equal(JSON.stringify(lead().appointments), seedMeeting);
ui.click("Close action"); ui.click("Follow up later"); ui.click(/Review in 30 days/);
assert.equal(lead().owner, "Sara · Off-plan adviser"); assert.equal(JSON.stringify(lead().appointments), seedMeeting);
assert.equal(lead().response.handoff.status, "requested");
ui.click("Close action"); accept(ui, "Sara");
assert.equal(lead().status, "Nurture", "acceptance does not erase a later follow-up choice");
assert.deepEqual(metrics(), ["3", "3", "1", "1"]);
ui.click("Close action"); ui.click("Schedule callback"); ui.click(/Tomorrow · 11:30 AM/);
assert.equal(lead().owner, "Sara · Off-plan adviser"); assert.equal(lead().response.state, "human");
assert.equal(JSON.stringify(lead().appointments), seedMeeting, "callback is not a meeting reassignment/reschedule");
assert.deepEqual(metrics(), ["3", "3", "1", "1"]);

// Every transfer is atomic with its task and B2 event; retry and rapid submits
// cannot publish extra transitions. Each reload reads the accepted snapshot.
for (const step of ["request", "accept", "return"]) {
  const s = storage(); let v = mount(s, key, options);
  if (step !== "request") { request(v); v.click("Close action"); }
  if (step === "return") { accept(v); v.click("Close action"); }
  const prior = s.data.get(key); const countBefore = events("maya-khan", s);
  const attentionBefore = summary(s).actions.length;
  v.click(step === "request" ? "Assign adviser" : step === "accept" ? "Review simulated acceptance" : "Review return to AI");
  const name = step === "request" ? /^Omar Investment/ : step === "accept" ? "Simulate acceptance by Omar" : "Confirm return to AI in sample";
  s.fail = "set"; v.click(name);
  assert.equal(s.data.get(key), prior); assert.equal(v.status(), ""); assert.match(v.alerts(), /Could not save/);
  assert.equal(events("maya-khan", s), countBefore); count(s, attentionBefore);
  assert.match(v.text(), /Unsubmitted choice/);
  now += 60000; s.fail = "";
  const retry = v.button("Retry saving action").props.onClick; retry(); retry(); v.flush();
  assert.equal(events("maya-khan", s), countBefore + 1);
  assert.equal(lead("maya-khan", s).timelineItems[0].recordedAt, new Date(now).toISOString());
  assert.equal(lead("maya-khan", s).response.state, step === "request" ? "paused" : step === "accept" ? "human" : "ai");
  const after = s.data.get(key); v.click(name, 2); v.click("Stop contact", 2);
  assert.equal(s.data.get(key), after); assert.doesNotMatch(v.text(), /Stop all contact/);
  v.click("Close action", 0); assert.equal(v.button("Assign adviser").props.disabled, false);
  v = mount(s, key, options); assert.equal(v.alerts(), ""); assert.equal(s.data.get(key), after);
  assert.deepEqual(metrics(s), ["3", "3", "1", "1"]);
}

// Callback and price remain independent of the handoff and of its acceptance.
const independent = storage(); const elena = mount(independent, key, { ...options, search: "?lead=elena-petrova&mode=sample" });
elena.click("Schedule callback"); elena.click(/Tomorrow · 11:30 AM/); elena.click("Close action");
const originalTasks = JSON.stringify(lead("elena-petrova", independent).tasks);
request(elena); count(independent, 4); elena.click("Close action"); accept(elena); count(independent, 3);
assert.equal(JSON.stringify(lead("elena-petrova", independent).tasks.filter(t => t.type !== "handoff")), originalTasks);
assert.deepEqual(metrics(independent), ["3", "3", "1", "1"]);

// DNC precedence is retained; B6 now preserves the meeting for internal review.
ui.click("Close action"); ui.click("Review return to AI");
const staleReturn = ui.button("Confirm return to AI in sample").props.onClick;
ui.click("Cancel"); ui.click("Stop contact"); ui.click("Confirm stop");
assert.equal(lead().status, "Do not contact"); assert.equal(lead().response.state, "paused");
assert.equal(lead().appointments[0].status, "confirmed"); assert.equal(lead().owner, "Sara · Off-plan adviser");
assert.equal(planHandoff(lead(), { kind: "return", target: "sara", id: taskId }).kind, "blocked");
const stopped = store.data.get(key); staleReturn(); ui.flush();
assert.equal(store.data.get(key), stopped); assert.doesNotMatch(ui.text(), /Review return to AI|Review simulated acceptance/);
assert.match(ui.text(), /Blocked by Do not contact/);
ui = mount(store, key, options); assert.equal(ui.alerts(), "");

// No draft/Retry/old handler can cross lead, tab, search, or browser history.
for (const action of ["accept", "return"]) for (const destination of ["lead", "search", "tab"]) {
  const s = storage(); const v = mount(s, key, options); request(v); v.click("Close action");
  if (action === "return") { accept(v); v.click("Close action"); }
  v.click(action === "accept" ? "Review simulated acceptance" : "Review return to AI");
  const name = action === "accept" ? "Simulate acceptance by Omar" : "Confirm return to AI in sample";
  const stale = v.button(name).props.onClick; s.fail = "set"; v.click(name);
  const retry = v.button("Retry saving action").props.onClick; const prior = s.data.get(key);
  if (destination === "lead") v.click(/^DW Daniel Wu/);
  if (destination === "search") v.fillSearch("NO_MATCH_B5");
  if (destination === "tab") v.click(/^Activity/);
  s.fail = ""; stale(); retry(); v.flush();
  assert.equal(s.data.get(key), prior); assert.doesNotMatch(v.text(), /Retry saving action|Simulate acceptance by Omar|Confirm return to AI in sample/);
  if (destination !== "search") { v.back(); assert.equal(s.data.get(key), prior); }
}

// Legacy data remains readable without a reset, fabricated acceptance or write.
const legacy = JSON.parse(JSON.stringify(ui.initialDemoLeads)); legacy.forEach(l => delete l.response);
const legacyStore = storage(); const raw = JSON.stringify(legacy); legacyStore.data.set(key, raw);
const old = mount(legacyStore, key, { ...options, search: "?lead=elena-petrova&mode=sample" });
assert.match(old.text(), /previous response control not recorded.*No explicit handoff recorded/);
assert.doesNotMatch(old.text(), /Review simulated acceptance|Review return to AI/);
assert.equal(legacyStore.data.get(key), raw); count(legacyStore, 2);
request(old); old.click("Close action"); accept(old); assert.equal(old.alerts(), "");
assert.equal(lead("elena-petrova", legacyStore).response.state, "human");

// An unknown pending target is readable but cannot be accepted; inconsistent
// accepted records fail closed, retaining the original storage bytes.
const unknown = JSON.parse(pendingSnapshot); unknown[0].response.handoff.target = "missing-adviser";
const unknownStore = storage(); unknownStore.data.set(key, JSON.stringify(unknown));
const unknownUI = mount(unknownStore, key, options);
assert.equal(unknownUI.alerts(), ""); assert.ok(unknownUI.button("Review simulated acceptance").props.disabled);
assert.match(unknownUI.text(), /Unknown destination/); assert.match(home(unknownStore).text(), /Unassigned · unknown destination/);
assert.equal(planHandoff(unknown[0], { kind: "accept", target: "missing-adviser", id: taskId }).kind, "blocked");
request(unknownUI); unknownUI.click("Close action"); accept(unknownUI); assert.equal(unknownUI.alerts(), "");
for (const bad of ["missing-response", "missing-task", "accepted-without-completion", "unknown-accepted"]) {
  const data = JSON.parse(acceptedSnapshot);
  if (bad === "missing-response") delete data[0].response;
  if (bad === "missing-task") data[0].tasks = [];
  if (bad === "accepted-without-completion") data[0].tasks[0].status = "open";
  if (bad === "unknown-accepted") data[0].response.handoff.target = "missing-adviser";
  const s = storage(); const corrupt = JSON.stringify(data); s.data.set(key, corrupt);
  assert.match(mount(s, key, options).alerts(), /could not be validated/);
  assert.match(home(s).alerts(), /number of open tasks is unknown/);
  assert.equal(s.data.get(key), corrupt); assert.ok(s.calls.every(([op]) => op === "get"));
}
assert.equal(store.data.get("propagent-setup-v1"), "original workspace");
assert.equal(store.data.get("propagent-sample-setup-v1"), "original sample setup");
assert.ok(store.calls.every(([, target]) => target === key));
console.log("PASS B5: request/pause/explicit simulated acceptance/return; independent owners and meeting; Home 2→3→2; idempotency and changed target; atomic failures/retries/events; DNC precedence; B3 draft guards; independent callback/price/KPIs; legacy/unknown/corrupt data; sample storage isolation.");
