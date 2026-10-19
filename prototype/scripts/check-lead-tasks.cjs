// B4: real component output and controlled storage, not browser hit-testing.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
const store = storage(); let ui = mount(store);
const { getHomeSummary } = ui.lib("home-summary");
const { readLeadStorage } = ui.lib("lead-storage");
const { getLeadTasks } = ui.lib("lead-tasks");
const read = () => readLeadStorage(() => store, key, ui.initialDemoLeads).leads;
const summary = () => getHomeSummary(read());
const home = (s = store, options = {}) => mount(s, key, { home: true, ...options });
const cards = view => view.all().filter(n => n.type === "article" && view.text(n).includes("Task:"));
const count = view => view.all().find(n => n.props.className === "count-badge").props.children;
const assertCount = expected => { const view = home(); assert.equal(count(view), expected); assert.equal(cards(view).length, expected); };
const callback = id => summary().actions.find(task => task.type === "callback" && task.leadId === id);
const price = () => summary().actions.find(task => task.type === "price-review");
assertCount(2);
assert.equal(store.data.has(key), false, "Home and Review never seed storage");
assert.equal(summary().metrics[3].value, "1");

// A failed save cannot publish a new Home task/count/event; retry publishes one.
ui.click(/^DW Daniel Wu/); ui.click("Schedule callback"); store.fail = "set";
ui.click(/Tomorrow · 11:30 AM/);
assert.equal(ui.status(), ""); assert.match(ui.alerts(), /Could not save/);
assert.match(ui.text(), /Activity 2/); assertCount(2);
store.fail = ""; ui.click("Retry saving action", 0);
assertCount(3); assert.equal(summary().metrics[3].value, "1");
const danielTask = callback("daniel-wu");
assert.equal(danielTask.dueAt, "2026-09-22T11:30:00+04:00");
assert.equal(danielTask.owner, "Nurture journey"); // B5 preserves the lead owner.
assert.equal(read().find(l => l.id === "daniel-wu").timelineItems.length, 3);
const afterRetry = store.data.get(key);
ui.click(/Tomorrow · 11:30 AM/, 2); ui.click("Stop contact", 2);
assert.equal(store.data.get(key), afterRetry); assert.doesNotMatch(ui.text(), /Stop all contact/);
ui.click("Close action", 0); ui.click("Schedule callback", 0); ui.click(/Today · 7:30 PM/);
assertCount(3); assert.equal(callback("daniel-wu").id, danielTask.id);
assert.equal(callback("daniel-wu").dueAt, "2026-09-21T19:30:00+04:00");
assert.equal(summary().metrics[3].value, "1");
ui.click("Close action"); ui.click("Assign adviser"); ui.click(/Omar Investment/);
assertCount(4); assert.equal(callback("daniel-wu").status, "open"); // B5 adds one pending handoff.
assert.equal(callback("daniel-wu").owner, "Omar · Investment adviser");
assert.equal(callback("daniel-wu").dueAt, "2026-09-21T19:30:00+04:00");

// Price has its own task state; assignment, nurture and a second work type do
// not supply a price result or remove the original unresolved issue.
ui.click(/^EP Elena Petrova/); const priceId = price().id;
ui.click("Assign adviser"); ui.click(/Sara Off-plan/); assertCount(5); // A second independent handoff.
assert.equal(price().id, priceId); assert.equal(price().status, "open");
ui.click("Close action"); ui.click("Follow up later"); ui.click(/Review in 90 days/);
assertCount(5); assert.equal(price().id, priceId); assert.equal(price().status, "open");
ui.click("Close action"); ui.click("Schedule callback"); ui.click(/Tomorrow · 11:30 AM/);
assertCount(6); assert.notEqual(price().id, callback("elena-petrova").id);
assert.equal(price().dueAt, undefined, "callback does not assign a price-review deadline");
assert.equal(price().status, "open");

// Review, reload and navigation have no business writes or new tasks/events.
const beforeReview = store.data.get(key); const beforeActions = JSON.stringify(summary().actions);
const view = home(store, { search: "?mode=sample&preview=sample&state=sample" });
const link = view.all().find(n => n.type === "a" && view.text(n) === "Review property price");
const url = new URL(link.props.href, "http://localhost:3230");
for (const field of ["mode", "preview", "state"]) assert.equal(url.searchParams.get(field), "sample");
assert.equal(url.searchParams.get("lead"), "elena-petrova"); assert.equal(url.searchParams.get("tab"), "overview");
ui = mount(store, key, { search: url.search });
assert.match(ui.text(), /Property price review/);
assert.match(ui.text(), /does not establish that the price is wrong/);
assert.match(ui.text(), /Price approval and availability verification are not implemented/);
ui.click(/^Activity/); ui.click("Conversation 2"); ui.back(); ui.forward();
assert.equal(store.data.get(key), beforeReview);
assert.equal(JSON.stringify(summary().actions), beforeActions); assertCount(6);

// DNC behaviour is not relaxed: task remains visible but is blocked for contact.
ui.click("Overview"); ui.click("Stop contact"); ui.click("Confirm stop");
assert.equal(callback("elena-petrova").status, "blocked");
assert.equal(price().status, "open"); assertCount(6);
assert.match(cards(home()).map(n => home().text(n)).join(" "), /Contact blocked.*cancelled; review only/);
assert.doesNotMatch(ui.text(), /Schedule callback/);

// No hardcoded identities, inference from nextAction/events, or lead-order sort.
const arbitrary = JSON.parse(JSON.stringify(ui.initialDemoLeads)).map((lead, i) => ({ ...lead,
  id: `unrelated-${i}`, name: `Fictional ${i}`, status: "Nurture", owner: "", nextAction: "Irrelevant text",
  timelineItems: [], tasks: lead.tasks.map(task => ({ ...task, id: `task-${i}-${task.type}` })),
}));
const generic = getHomeSummary(arbitrary);
assert.equal(generic.actions.length, 2); assert.ok(generic.actions.every(t => t.owner === "Unassigned"));
assert.ok(generic.actions.every(t => t.review.lead === t.leadId && t.leadId.startsWith("unrelated-")));
assert.equal(JSON.stringify(getLeadTasks([...read()].reverse())), JSON.stringify(getLeadTasks(read())), "due then stable ID, not lead order");
const noTasks = arbitrary.map(l => ({ ...l, tasks: [], status: "Callback scheduled" }));
assert.equal(getHomeSummary(noTasks).actions.length, 0, "modern status is never task state");

// Conservative read-only legacy adapter: no reset, inferred completion or write.
const legacyStore = storage(); const legacy = JSON.parse(JSON.stringify(ui.initialDemoLeads));
legacy.forEach(l => delete l.tasks);
legacy.find(l => l.id === "elena-petrova").status = "Nurture";
Object.assign(legacy.find(l => l.id === "daniel-wu"), { status: "Callback scheduled", due: "unrecorded legacy deadline" });
const legacyRaw = JSON.stringify(legacy); legacyStore.data.set(key, legacyRaw);
const legacyHome = home(legacyStore);
assert.equal(count(legacyHome), 3); assert.match(legacyHome.text(), /Older sample: task information is incomplete/);
assert.match(legacyHome.text(), /Callback time unknown/);
assert.equal(legacyStore.data.get(key), legacyRaw); assert.ok(legacyStore.calls.every(([op]) => op === "get"));
const oddDeadline = JSON.parse(legacyRaw); oddDeadline.find(l => l.id === "daniel-wu").due = "constructor";
const oddStore = storage(); oddStore.data.set(key, JSON.stringify(oddDeadline));
assert.match(home(oddStore).text(), /Callback time unknown/, "arbitrary old strings never become dates via inherited object properties");
const oldLead = mount(legacyStore, key, { search: "?lead=daniel-wu&mode=sample" });
oldLead.click("Schedule callback"); oldLead.click(/Today · 7:30 PM/);
assert.equal(count(home(legacyStore)), 3);
assert.equal(JSON.parse(legacyStore.data.get(key)).find(l => l.id === "daniel-wu").tasks.length, 1);
assert.equal(JSON.stringify(JSON.parse(legacyStore.data.get(key))[0].timelineItems), JSON.stringify(legacy[0].timelineItems));

// Malformed tasks and access errors are never zero tasks/silent seed fallback.
for (const kind of ["get", "getter", "invalid", "bad-date", "duplicate-callback"]) {
  const failed = storage(); let raw = JSON.stringify(ui.initialDemoLeads);
  if (kind === "get") failed.fail = "get";
  if (kind === "getter") failed.getterFails = true;
  if (kind === "invalid") raw = "broken";
  if (kind === "bad-date" || kind === "duplicate-callback") {
    const bad = JSON.parse(raw);
    if (kind === "bad-date") bad[1].tasks[0].dueAt = "tomorrow";
    else bad[1].tasks.push({ ...bad[1].tasks[0], id: "another-callback" });
    raw = JSON.stringify(bad);
  }
  failed.data.set(key, raw); const blockedHome = home(failed);
  assert.match(blockedHome.alerts(), /Sample attention is unavailable.*number of open tasks is unknown/);
  assert.equal(cards(blockedHome).length, 0); assert.doesNotMatch(blockedHome.text(), /No callback or price-review items|0 items need/);
  blockedHome.click("Retry loading sample Home");
  assert.equal(failed.data.get(key), raw); assert.ok(failed.calls.every(([op]) => op === "get"));
  failed.fail = ""; failed.getterFails = false; failed.data.set(key, JSON.stringify(ui.initialDemoLeads));
  blockedHome.click("Retry loading sample Home"); assert.equal(count(blockedHome), 2);
}
assert.equal(store.data.get("propagent-setup-v1"), "original workspace");
assert.equal(store.data.get("propagent-sample-setup-v1"), "original sample setup");
assert.ok(store.calls.every(([, target]) => target === key));
console.log("PASS B4: shared cards/count, 2→3 and one appointment, reschedule stable ID, price survives assignment/nurture, two task types, read-only Review/reload, mode-preserving URLs, blocked DNC, due ordering, legacy/unknown, failed save/retry and Home read-error recovery.");
