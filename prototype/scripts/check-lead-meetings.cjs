// B6: controlled component output/storage/clock. Native UI checks are separate.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
let now = Date.parse("2026-10-03T09:00:00Z");
const options = { search: "?lead=maya-khan&mode=sample&preview=sample", now: () => now };
const store = storage(); let ui = mount(store, key, options);
const { readLeadStorage } = ui.lib("lead-storage");
const { getHomeSummary } = ui.lib("home-summary");
const { planStopContact, planMeetingDecision } = ui.lib("lead-meetings");
const read = (s = store) => readLeadStorage(() => s, key, ui.initialDemoLeads).leads;
const maya = (s = store) => read(s).find(l => l.id === "maya-khan");
const meeting = (s = store) => maya(s).appointments[0];
const events = (s = store) => maya(s).timelineItems.length;
const metrics = (s = store) => Array.from(getHomeSummary(read(s)).metrics, m => m.value);
const home = (s = store) => mount(s, key, { ...options, home: true });
const count = (s, expected) => {
  const h = home(s);
  assert.equal(h.all().find(n => n.props.className === "count-badge").props.children, expected);
  assert.equal(h.all().filter(n => n.type === "article" && h.text(n).includes("Task:")).length, expected);
};
const stop = v => { v.click("Stop contact"); v.click("Confirm stop"); };
const seedMeeting = JSON.stringify(meeting()); const seedOtherTasks = JSON.stringify(read().slice(1).map(l => l.tasks));
const seed = JSON.stringify(ui.initialDemoLeads);
count(store, 2);
ui.click("Stop contact");
assert.match(ui.text(), /Confirmed meetings stay unchanged.*separate decision/);
const submitStop = ui.button("Confirm stop").props.onClick; submitStop(); submitStop(); ui.flush();
assert.equal(events(), 6); assert.equal(JSON.stringify(meeting()), seedMeeting);
assert.equal(maya().status, "Do not contact"); assert.equal(maya().response.state, "paused");
assert.deepEqual(metrics(), ["3", "3", "1", "1"]); count(store, 3);
const review = maya().tasks.find(t => t.type === "meeting-review");
assert.equal(review.meetingId, meeting().id); assert.equal(review.status, "open");
const homeReview = getHomeSummary(read()).actions.find(t => t.type === "meeting-review");
assert.equal(homeReview.owner, "Sara · Off-plan adviser");
assert.match(ui.text(), /Contact blocked.*automatic reminders remain blocked.*does not authorize manual contact/);
assert.doesNotMatch(ui.text(), /Review return to AI/);
const stopped = store.data.get(key);
assert.equal(planStopContact(maya()).kind, "unchanged");
ui.click("Confirm stop", 2); assert.equal(store.data.get(key), stopped);
ui.click("Close action", 0); assert.ok(!ui.button("Review meeting decision").props.disabled);

// The Home destination names the exact meeting, without opening a decision.
const h = home(); const href = h.all().find(n => n.type === "a" && h.text(n) === "Review meeting").props.href;
const url = new URL(href, "http://localhost:3230");
assert.equal(url.hash, "#meeting-maya-meeting-1");
assert.equal(url.searchParams.get("lead"), "maya-khan");
for (const field of ["mode", "preview"]) assert.equal(url.searchParams.get(field), "sample");
ui = mount(store, key, { ...options, search: url.search });
assert.equal(store.data.get(key), stopped);
ui.click("Review meeting decision"); assert.match(ui.text(), /Internal sample decision for meeting maya-meeting-1/);
ui.click("Back without changes"); ui.click("Review meeting decision");
assert.equal(store.data.get(key), stopped); assert.equal(events(), 6);
const keep = ui.button("Confirm keep meeting").props.onClick; keep(); keep(); ui.flush();
assert.equal(events(), 7); assert.equal(meeting().status, "confirmed"); assert.equal(meeting().decision, "keep");
assert.equal(maya().tasks.find(t => t.id === review.id).status, "completed"); count(store, 2);
assert.equal(maya().status, "Do not contact"); assert.equal(maya().response.state, "paused");
assert.deepEqual(metrics(), ["3", "3", "1", "1"]);
assert.match(ui.text(), /Internal sample decision: Keep meeting.*Demo user.*No notification sent/);
assert.equal(maya().timelineItems[0].actor, "user"); assert.equal(maya().timelineItems[0].recordedAt, new Date(now).toISOString());
const kept = store.data.get(key);
ui.click("Confirm keep meeting", 2); ui.click("Confirm cancel meeting", 2);
assert.equal(store.data.get(key), kept, "second click must not cancel a just-kept meeting");
ui.click("Close action", 0); ui = mount(store, key, options);
assert.equal(store.data.get(key), kept); count(store, 2);
assert.doesNotMatch(ui.text(), /Review meeting decision/);
assert.equal(planStopContact(maya()).kind, "unchanged", "Stop cannot reopen the completed review");
ui.click("Review cancellation"); ui.click("Confirm cancel meeting");
assert.equal(events(), 8); assert.equal(meeting().status, "cancelled"); assert.equal(meeting().decision, "cancel");
assert.equal(meeting().id, JSON.parse(seedMeeting).id); assert.equal(meeting().startsAt, JSON.parse(seedMeeting).startsAt);
assert.equal(meeting().owner, JSON.parse(seedMeeting).owner);
assert.deepEqual(metrics(), ["3", "3", "1", "0"]); count(store, 2);
assert.equal(JSON.stringify(read().slice(1).map(l => l.tasks)), seedOtherTasks);
assert.equal(maya().status, "Do not contact"); assert.equal(maya().response.state, "paused");
const cancelled = store.data.get(key); ui.click("Confirm cancel meeting", 2); ui.click("Confirm cancel meeting", 0);
assert.equal(store.data.get(key), cancelled);
assert.equal(planMeetingDecision(maya(), { kind: "cancel-meeting", meetingId: meeting().id }).kind, "unchanged");
ui.click("Close action"); ui = mount(store, key, options);
assert.equal(ui.alerts(), ""); assert.doesNotMatch(ui.text(), /Review cancellation|Review meeting decision/);
assert.equal(store.data.get(key), cancelled);

// Stop/keep/cancel failures retain a valid snapshot and retry exactly once.
for (const kind of ["stop", "keep", "cancel"]) {
  const s = storage(); const v = mount(s, key, options);
  if (kind !== "stop") { stop(v); v.click("Close action"); v.click("Review meeting decision"); }
  else v.click("Stop contact");
  const name = kind === "stop" ? "Confirm stop" : kind === "keep" ? "Confirm keep meeting" : "Confirm cancel meeting";
  const prior = s.data.get(key); const beforeEvents = events(s); const beforeCount = getHomeSummary(read(s)).actions.length;
  s.fail = "set"; v.click(name);
  assert.equal(v.status(), ""); assert.match(v.alerts(), /Could not save/); assert.match(v.text(), /Unsubmitted choice/);
  assert.equal(s.data.get(key), prior); assert.equal(events(s), beforeEvents); count(s, beforeCount);
  assert.equal(meeting(s).status, "confirmed"); assert.equal(meeting(s).decision, undefined);
  now += 60000; s.fail = "";
  const retry = v.button("Retry saving action").props.onClick; retry(); retry(); v.flush();
  assert.equal(events(s), beforeEvents + 1);
  assert.equal(maya(s).timelineItems[0].recordedAt, new Date(now).toISOString());
  assert.equal(maya(s).timelineItems[0].actor, "user");
  assert.equal(meeting(s).status, kind === "cancel" ? "cancelled" : "confirmed");
  const result = s.data.get(key); v.click(name, 2); assert.equal(s.data.get(key), result);
  v.click("Close action", 0); assert.equal(mount(s, key, options).alerts(), "");
  count(s, kind === "stop" ? 3 : 2);
}

// Cancel without DNC must not suppress, transfer control, or change another task.
const normal = storage(); const normalUI = mount(normal, key, options);
const originalControl = JSON.stringify(maya(normal).response); const originalOwner = maya(normal).owner;
normalUI.click("Review cancellation"); normalUI.click("Back without changes"); assert.equal(normal.data.has(key), false);
normalUI.click("Review cancellation"); normalUI.click("Confirm cancel meeting");
assert.equal(maya(normal).status, "Qualified"); assert.equal(maya(normal).owner, originalOwner);
assert.equal(JSON.stringify(maya(normal).response), originalControl);
assert.deepEqual(metrics(normal), ["3", "3", "1", "0"]); count(normal, 2);
normalUI.click("Close action"); assert.ok(!normalUI.button("Assign adviser").props.disabled);

// Same-lead callback/price/handoff stay independent, including pending handoff
// history after DNC. Internal meeting actions never authorize a human or AI reply.
const independent = storage(); const fixture = JSON.parse(seed);
fixture[0].tasks.push({ ...fixture[2].tasks[0], id: "maya-price" });
independent.data.set(key, JSON.stringify(fixture)); const separate = mount(independent, key, options);
separate.click("Schedule callback"); separate.click(/Today · 7:30 PM/); separate.click("Close action");
separate.click("Assign adviser"); separate.click(/Omar Investment/); separate.click("Close action"); stop(separate);
const blockedTasks = JSON.stringify(maya(independent).tasks.filter(t => t.type !== "meeting-review"));
const response = JSON.stringify(maya(independent).response);
assert.equal(maya(independent).tasks.find(t => t.type === "callback").status, "blocked");
assert.equal(maya(independent).tasks.find(t => t.type === "handoff").status, "blocked");
assert.equal(maya(independent).tasks.find(t => t.type === "price-review").status, "open");
separate.click("Close action"); separate.click("Review meeting decision"); separate.click("Confirm keep meeting");
assert.equal(JSON.stringify(maya(independent).response), response);
assert.equal(JSON.stringify(maya(independent).tasks.filter(t => t.type !== "meeting-review")), blockedTasks);
separate.click("Close action"); separate.click("Review cancellation"); separate.click("Confirm cancel meeting");
assert.equal(JSON.stringify(maya(independent).response), response);
assert.equal(JSON.stringify(maya(independent).tasks.filter(t => t.type !== "meeting-review")), blockedTasks);
assert.equal(getHomeSummary(read(independent)).actions.find(t => t.type === "meeting-review"), undefined);

// Form/Retry scope: changing lead, tab, query or history discards internal drafts.
for (const kind of ["keep", "cancel"]) for (const destination of ["lead", "tab", "query", "history"]) {
  const s = storage(); const v = mount(s, key, options); stop(v); v.click("Close action");
  if (destination === "history") { v.click(/^Activity/); v.click("Overview"); }
  v.click("Review meeting decision");
  const name = kind === "keep" ? "Confirm keep meeting" : "Confirm cancel meeting";
  const stale = v.button(name).props.onClick; s.fail = "set"; v.click(name);
  const retry = v.button("Retry saving action").props.onClick; const before = s.data.get(key);
  if (destination === "lead") v.click(/^EP Elena Petrova/);
  if (destination === "tab") v.click(/^Activity/);
  if (destination === "query") v.fillSearch("NO_MATCH_B6");
  if (destination === "history") v.back();
  s.fail = ""; stale(); retry(); v.flush(); assert.equal(s.data.get(key), before);
  assert.doesNotMatch(v.text(), /Confirm keep meeting|Confirm cancel meeting|Retry saving action/);
  if (destination === "query") {
    assert.match(v.text(), /outside the search results/); assert.ok(v.button("Review meeting decision").props.disabled);
    v.fillSearch(""); assert.ok(!v.button("Review meeting decision").props.disabled);
  }
}

// Two meetings: exact task owner/anchor/identity; stale Retry cannot hit another.
const multiple = storage(); const multiSeed = JSON.parse(seed);
multiSeed[0].appointments.push({ ...multiSeed[0].appointments[0], id: "maya-meeting-2", startsAt: "2026-09-21T21:00:00+04:00" });
delete multiSeed[0].appointments[1].owner;
multiple.data.set(key, JSON.stringify(multiSeed)); const multi = mount(multiple, key, options); stop(multi); multi.click("Close action");
const reviews = getHomeSummary(read(multiple)).actions.filter(t => t.type === "meeting-review");
assert.equal(reviews.length, 2); assert.notEqual(reviews[0].id, reviews[1].id);
assert.equal(reviews[1].owner, "Unassigned"); assert.equal(reviews[1].review.hash, "#meeting-maya-meeting-2");
function reviewMeeting(view, id) {
  const region = view.all().find(n => n.props["aria-label"] === "Meeting " + id);
  const button = view.all(region).find(n => n.type === "button" && view.text(n) === "Review meeting decision");
  assert.ok(button && !button.props.disabled); button.props.onClick(); view.flush();
}
reviewMeeting(multi, "maya-meeting-1"); multiple.fail = "set"; multi.click("Confirm cancel meeting");
const oldRetry = multi.button("Retry saving action").props.onClick;
multi.click("Back without changes"); multiple.fail = ""; reviewMeeting(multi, "maya-meeting-2");
const multiBefore = multiple.data.get(key); oldRetry(); multi.flush(); assert.equal(multiple.data.get(key), multiBefore);
multi.click("Confirm keep meeting"); multi.click("Close action");
assert.equal(maya(multiple).appointments[1].decision, "keep"); assert.equal(maya(multiple).appointments[0].decision, undefined);
reviewMeeting(multi, "maya-meeting-1"); multi.click("Confirm cancel meeting");
assert.equal(maya(multiple).appointments[0].status, "cancelled"); assert.equal(maya(multiple).appointments[1].status, "confirmed");
assert.deepEqual(metrics(multiple), ["3", "3", "1", "1"]); count(multiple, 2);

// Pre-B6 cancelled records/history stay byte-for-byte intact: no task or revival.
const old = JSON.parse(seed); old[0].status = "Do not contact"; delete old[0].response;
old[0].appointments[0].status = "cancelled";
const legacy = storage(); const oldRaw = JSON.stringify(old); legacy.data.set(key, oldRaw);
const legacyUI = mount(legacy, key, options); assert.equal(legacyUI.alerts(), "");
assert.match(legacyUI.text(), /Property consultation · cancelled/); assert.doesNotMatch(legacyUI.text(), /Review cancellation|Review meeting decision/);
assert.equal(legacy.data.get(key), oldRaw); count(legacy, 2); assert.deepEqual(metrics(legacy), ["3", "3", "1", "0"]);
assert.ok(legacy.calls.every(([op]) => op === "get"));
for (const kind of ["get", "orphan", "duplicate", "false-completion", "invalid-decision"]) {
  const s = storage(); const data = JSON.parse(stopped);
  if (kind === "get") s.fail = "get";
  if (kind === "orphan") data[0].tasks[0].meetingId = "missing";
  if (kind === "duplicate") data[0].tasks.push({ ...data[0].tasks[0], id: "duplicate-review" });
  if (kind === "false-completion") data[0].tasks[0].status = "completed";
  if (kind === "invalid-decision") data[0].appointments[0].decision = "approved";
  const raw = JSON.stringify(data); s.data.set(key, raw);
  assert.match(mount(s, key, options).alerts(), /could not be validated|storage could not be read/);
  assert.match(home(s).alerts(), /number of open tasks is unknown/);
  assert.equal(s.data.get(key), raw); assert.ok(s.calls.every(([op]) => op === "get"));
}
for (const s of [store, normal, independent, multiple, legacy]) {
  assert.equal(s.data.get("propagent-setup-v1"), "original workspace");
  assert.equal(s.data.get("propagent-sample-setup-v1"), "original sample setup");
  assert.ok(s.calls.every(([, target]) => target === key));
}
console.log("PASS B6: Stop preserves confirmed meeting; explicit keep/cancel and one-review task; atomic failure/retry and double-submit; B2 actor/time; B3 lead/meeting/draft guards; DNC response precedence; independent tasks/owners/KPIs; non-DNC cancellation; legacy no revival; invalid/read errors; Sample isolation.");
