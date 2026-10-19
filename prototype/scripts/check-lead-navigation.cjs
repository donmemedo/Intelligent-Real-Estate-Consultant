// Component output with controlled Next navigation/history and Storage.
// This is not a browser: the acceptance journeys also run in the fresh IAB build.
const assert = require("node:assert/strict");
const { mount, storage, key } = require("./check-lead-actions.cjs");
const params = ui => new URL(ui.url(), "http://localhost:3230").searchParams;
const selected = ui => ui.all().filter(n => n.type === "h2").map(n => ui.text(n)).find(t => t !== "Choose a lead");
const searchValue = ui => ui.all().find(n => n.type === "input" && n.props["aria-label"] === "Search leads").props.value;
const noWrites = store => assert.ok(store.calls.every(([op]) => op === "get"), "navigation must never write/remove business data");
const assertContext = ui => {
  assert.equal(params(ui).get("mode"), "sample");
  assert.equal(params(ui).get("preview"), "sample");
  assert.equal(params(ui).get("state"), "sample");
  assert.equal(params(ui).get("extra"), "keep me");
  assert.ok(ui.url().endsWith("#home-review"));
};
const context = "mode=sample&preview=sample&state=sample&extra=keep+me";
const s = storage();
let ui = mount(s, key, { search: `?${context}&lead=elena-petrova#home-review` });
assert.equal(selected(ui), "Elena Petrova");
ui.click(/^MK Maya Khan/);
assert.equal(selected(ui), "Maya Khan"); assert.equal(params(ui).get("lead"), "maya-khan");
assert.equal(ui.history().length, 2); assertContext(ui);
const reload = mount(s, key, { search: ui.url().slice("/leads".length) });
assert.equal(selected(reload), "Maya Khan");
ui.back(); assert.equal(selected(ui), "Elena Petrova");
ui.forward(); assert.equal(selected(ui), "Maya Khan");
ui.click(/^Activity/); const tabHistoryLength = ui.history().length;
for (const q of ["M", "Ma", "May", "Maya"]) ui.fillSearch(q);
assert.equal(ui.history().length, tabHistoryLength, "typing replaces one entry, not one push per character");
assert.equal(params(ui).get("tab"), "activity"); assert.equal(params(ui).get("q"), "Maya");
assertContext(ui); assert.equal(selected(ui), "Maya Khan");
const direct = mount(s, key, { search: ui.url().slice("/leads".length) });
assert.equal(selected(direct), "Maya Khan"); assert.equal(searchValue(direct), "Maya");
assert.match(direct.text(), /What happened and why/);
ui.back(); assert.equal(params(ui).get("tab"), "overview"); assert.equal(searchValue(ui), "");
ui.forward(); assert.equal(searchValue(ui), "Maya"); assert.match(ui.text(), /What happened and why/);
ui.click("Overview"); ui.click("Schedule callback");
const oldSubmit = ui.button(/Tomorrow · 11:30 AM/).props.onClick;
ui.fillSearch("NO_MATCH_B3");
assert.equal(selected(ui), "Maya Khan"); assert.equal(params(ui).get("lead"), "maya-khan");
assert.match(ui.status(), /outside the search results.*read-only/);
assert.doesNotMatch(ui.text(), /Choose a clear time/);
for (const name of ["Schedule callback", "Assign adviser", "Follow up later", "Stop contact", "Reset fictional leads"]) {
  assert.ok(ui.button(name).props.disabled); ui.click(name);
}
oldSubmit(); ui.flush(); noWrites(s);
ui.click("Clear search");
assert.equal(selected(ui), "Maya Khan"); assert.ok(!ui.button("Schedule callback").props.disabled);
assert.equal(params(ui).has("q"), false); assert.equal(ui.status(), "");
oldSubmit(); ui.flush(); noWrites(s); // a discarded handler cannot revive after clear
ui.fillSearch("Elena");
assert.equal(selected(ui), "Maya Khan"); assert.match(ui.status(), /outside the search results/);
ui.click(/^EP Elena Petrova/); assert.equal(selected(ui), "Elena Petrova");
assert.ok(!ui.button("Schedule callback").props.disabled);
ui.back(); assert.equal(selected(ui), "Maya Khan"); assert.ok(ui.button("Schedule callback").props.disabled);
ui.click("Clear search"); noWrites(s);

// Initial absent ID is a distinct valid entry: select the original first lead
// and replace (not push) its ID into the URL, even when it is outside the query.
const first = mount(s, key, { search: "?mode=sample&q=Ahmed&tab=conversation" });
assert.equal(selected(first), "Maya Khan"); assert.equal(params(first).get("lead"), "maya-khan");
assert.equal(first.history().length, 1); assert.equal(first.navigationCalls[0][0], "replace");
assert.match(first.text(), /WhatsApp and voice context together/);
assert.match(first.status(), /outside the search results/);
for (const id of ["unknown-lead", ""]) {
  const invalid = mount(s, key, { search: `?mode=sample&lead=${id}&tab=activity&q=Maya` });
  assert.equal(selected(invalid), "Lead not found");
  assert.equal(params(invalid).get("lead"), id);
  assert.doesNotMatch(invalid.text(), /Lead owner|Manage the next step|Property consultation · confirmed/);
  assert.ok(invalid.button("Reset fictional leads").props.disabled);
  invalid.click("Back to lead list");
  assert.equal(selected(invalid), "Maya Khan"); assert.equal(params(invalid).get("mode"), "sample");
  assert.equal(params(invalid).has("q"), false);
}
const invalidTab = mount(s, key, { search: `?${context}&lead=elena-petrova&tab=bad&q=Elena#home-review` });
assert.equal(selected(invalidTab), "Elena Petrova");
assert.equal(params(invalidTab).get("tab"), "overview"); assert.equal(searchValue(invalidTab), "Elena");
assertContext(invalidTab); assert.equal(invalidTab.history().length, 1); noWrites(s);

// Failed Retry belongs to the original lead AND action session; it cannot be
// applied after selection, search or history changes, even via a retained callback.
for (const change of ["lead", "query", "tab", "history-before-render"]) {
  const store = storage(); store.data.set(key, JSON.stringify(ui.initialDemoLeads));
  const original = store.data.get(key);
  const view = mount(store, key, { search: "?mode=sample&lead=elena-petrova&tab=overview" });
  view.click("Assign adviser"); store.fail = "set"; view.click(/Omar Investment/);
  assert.equal(view.status(), ""); assert.match(view.alerts(), /Could not save/);
  const oldRetry = view.button("Retry saving action").props.onClick;
  store.fail = "";
  if (change === "lead") view.click(/^MK Maya Khan/);
  if (change === "query") view.fillSearch("NO_MATCH");
  if (change === "tab") view.click(/^Activity/);
  if (change === "history-before-render") view.visit("/leads?mode=sample&lead=maya-khan&tab=overview", false);
  const attempts = store.calls.filter(([op]) => op === "set").length;
  oldRetry(); view.flush();
  assert.equal(store.data.get(key), original);
  assert.equal(store.calls.filter(([op]) => op === "set").length, attempts);
  assert.doesNotMatch(view.text(), /Retry saving action|Unsubmitted choice|Could not save/);
  if (change === "query") view.click("Clear search"); else view.back();
  oldRetry(); view.flush(); assert.equal(store.data.get(key), original);
  assert.doesNotMatch(view.text(), /Retry saving action|Unsubmitted choice/);
}

// Pending navigation must disable the previous lead's controls before the
// destination commits; fast replace typing and reverting to empty must settle.
const pendingStore = storage(); const pending = mount(pendingStore);
pending.click("Schedule callback"); const pendingSubmit = pending.button(/Tomorrow · 11:30 AM/).props.onClick;
pending.deferNavigation(); pending.click(/^MK Maya Khan/);
assert.match(pending.status(), /Updating selection/); assert.ok(pending.button("Stop contact").props.disabled);
pendingSubmit(); pending.flush(); noWrites(pendingStore);
pending.finishNavigation(); assert.equal(selected(pending), "Maya Khan");
assert.ok(!pending.button("Schedule callback").props.disabled);
const historyLength = pending.history().length;
pending.deferNavigation();
for (const q of ["M", "May", "Maya", ""]) pending.fillSearch(q);
pending.finishNavigation();
assert.equal(selected(pending), "Maya Khan"); assert.equal(searchValue(pending), "");
assert.equal(params(pending).has("q"), false); assert.equal(pending.history().length, historyLength);
noWrites(pendingStore);

// Search clearing must never bypass DNC or B1 storage recovery.
const stoppedStore = storage(); const stoppedSeed = JSON.parse(JSON.stringify(ui.initialDemoLeads));
stoppedSeed[0].status = "Do not contact"; stoppedStore.data.set(key, JSON.stringify(stoppedSeed));
const stopped = mount(stoppedStore, key, { search: "?mode=sample&lead=maya-khan" });
stopped.fillSearch("NO_MATCH"); stopped.click("Clear search");
assert.match(stopped.text(), /Contact is stopped/);
assert.ok(!stopped.all().some(n => n.type === "button" && stopped.text(n) === "Schedule callback"));
const deniedStore = storage(); deniedStore.fail = "get";
const denied = mount(deniedStore, key, { search: "?mode=sample&lead=maya-khan&q=NO_MATCH" });
assert.match(denied.alerts(), /storage could not be read/);
assert.ok(!denied.all().some(n => n.type === "input")); noWrites(deniedStore);

// An action that changes a searched status may leave the results; it still saves
// exactly once, then becomes read-only. Clearing search does not reopen its form.
const mutationStore = storage(); const mutation = mount(mutationStore, key, { search: "?mode=sample&lead=maya-khan&q=Qualified" });
mutation.click("Assign adviser"); mutation.click(/Omar Investment/);
assert.match(mutation.status(), /outside the search results/);
assert.ok(mutation.button("Schedule callback").props.disabled);
assert.equal(JSON.parse(mutationStore.data.get(key))[0].timelineItems.length, 6);
mutation.click("Clear search"); assert.equal(selected(mutation), "Maya Khan");
assert.ok(!mutation.button("Schedule callback").props.disabled);
assert.doesNotMatch(mutation.text(), /Assign an adviser and request handoff/);
assert.equal(mutationStore.data.get("propagent-setup-v1"), "original workspace");
console.log("PASS B3: URL-selected identity/tab/query, push vs replace history, reload/deep links, Back/Forward, invalid/absent IDs, invalid-tab normalization, read-only out-of-results, discarded forms/Retry/stale handlers, pending navigation, rapid query replacement, preserved context, DNC and B1 recovery; navigation creates no business events.");
