// No additional dependency. Render the real component's element tree with a
// small synchronous hook host and controlled Storage. This is not a DOM/browser
// test: native hit-testing, focus and multi-click are checked separately in IAB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const code = new Map();
function compiled(file) {
  if (!code.has(file)) code.set(file, ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText);
  return code.get(file);
}
function storage() {
  const data = new Map([["propagent-setup-v1", "original workspace"], ["propagent-sample-setup-v1", "original sample setup"]]);
  return {
    data, calls: [], fail: "", getterFails: false,
    getItem(key) { this.calls.push(["get", key]); if (this.fail === "get") throw Error("denied"); return data.get(key) ?? null; },
    setItem(key, value) { this.calls.push(["set", key]); if (this.fail === "set") throw Error("quota"); data.set(key, value); },
    removeItem(key) { this.calls.push(["remove", key]); if (this.fail === "remove") throw Error("denied"); data.delete(key); },
  };
}
const key = "propagent-demo-leads-v2";
function mount(store, storageKey = key, options = {}) {
  const hooks = [], effects = [], modules = new Map(), intervals = [];
  const clock = options.now ?? (() => Date.now());
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock()])); }
    static now() { return clock(); }
  }
  let cursor = 0, dirty = true, tree, transitionPending = false, deferNavigation = false, pendingNavigation;
  const history = ["/leads" + (options.search ?? "?lead=ahmed-rahman&mode=sample")];
  let historyIndex = 0;
  const navigationCalls = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((dep, n) => dep !== hooks[i][n])) { hooks[i] = deps; effects.push(fn); } },
    useTransition() { cursor++; return [transitionPending, fn => { transitionPending = true; fn(); if (!deferNavigation) transitionPending = false; dirty = true; }]; },
  };
  const fakeWindow = {
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {},
    get localStorage() { if (store.getterFails) throw Error("storage property denied"); return store; },
    location: new URL(history[0], "http://localhost:3230"),
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}, matchMedia() { return { matches: false }; },
    setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {},
  };
  fakeWindow.history = { state: {}, replaceState(_state, _title, href) {
    history[historyIndex] = href;
    fakeWindow.location = new URL(href, "http://localhost:3230");
  } };
  function commitNavigation(method, href) {
    if (method === "push") { history.splice(historyIndex + 1); history.push(href); historyIndex++; }
    else history[historyIndex] = href;
    fakeWindow.location = new URL(href, "http://localhost:3230");
    dirty = true;
  }
  const router = Object.fromEntries(["push", "replace"].map(method => [method, href => {
    navigationCalls.push([method, href]);
    if (deferNavigation) pendingNavigation = [method, href]; else commitNavigation(method, href);
  }]));
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} }; modules.set(file, loadedModule);
    const localRequire = spec => {
      if (spec === "react") return react;
      if (spec === "next/navigation") return { useRouter: () => router, usePathname: () => fakeWindow.location.pathname, useSearchParams: () => new URLSearchParams(fakeWindow.location.search) };
      if (spec === "next/link") return ({ children, ...props }) => ({ type: "a", props: { ...props, children } });
      if (spec === "lucide-react") return new Proxy({}, { get: () => () => null });
      // This synchronous host has one hook scope. The keyed notes child owns
      // independent hooks and is exercised in the real-browser merge check.
      if (spec === "@/components/lead-continuation") return { LeadContinuation: () => null };
      if (spec.startsWith("@/")) return load(path.join(root, spec.slice(2)) + ".ts");
      if (spec.startsWith(".")) return load(path.resolve(path.dirname(file), spec) + ".ts");
      return require(spec);
    };
    vm.runInNewContext(compiled(file), { module: loadedModule, exports: loadedModule.exports, require: localRequire, window: fakeWindow, document: { getElementById() { return null; } }, URLSearchParams, Date: ClockDate, crypto: require("node:crypto").webcrypto, setTimeout, clearTimeout, console }, { filename: file });
    return loadedModule.exports;
  }
  const { initialDemoLeads } = load(path.join(root, "lib/demo-leads.ts"));
  const { LeadWorkspace } = load(path.join(root, "components/lead-workspace.tsx"));
  const { OperationalHome } = options.home ? load(path.join(root, "components/operational-home.tsx")) : {};
  const { GuidedProductDemo } = options.guided ? load(path.join(root, "components/guided-product-demo.tsx")) : {};
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function flush() {
    let renders = 0;
    while (dirty) {
      assert.ok(renders++ < 20, "component must settle"); dirty = false; cursor = 0;
      const homeRead = options.home ? load(path.join(root, "lib/lead-storage.ts")).readLeadStorage(() => fakeWindow.localStorage, storageKey, initialDemoLeads) : null;
      tree = expand(options.guided ? GuidedProductDemo() : options.home
        ? OperationalHome({ leads: homeRead.kind === "ready" ? homeRead.leads : [], sampleData: true, loadState: homeRead.kind,
          navigationSearch: options.search ?? "", onRetry: () => { dirty = true; } })
        : LeadWorkspace({ initialLeads: initialDemoLeads, storageKey, allowReset: !!storageKey }));
      effects.splice(0).forEach(effect => effect());
    }
  }
  function all(node = tree) {
    if (Array.isArray(node)) return node.flatMap(child => all(child ?? null));
    if (!node || typeof node !== "object") return [];
    return [node, ...all(node.props.children ?? null)];
  }
  function text(node = tree) {
    if (Array.isArray(node)) return node.map(child => text(child ?? null)).join(" ").replace(/\s+/g, " ").trim();
    if (node === null || node === undefined || typeof node === "boolean") return "";
    return typeof node === "object" ? text(node.props.children ?? null) : String(node);
  }
  function button(name) {
    const found = all().filter(node => node.type === "button" && (name instanceof RegExp ? name.test(text(node)) : text(node) === name));
    assert.equal(found.length, 1, `one button: ${name}`); return found[0];
  }
  function click(name, detail = 1) {
    const target = button(name); let stopped = false;
    all().find(node => node.props.onClickCapture)?.props.onClickCapture({ detail, preventDefault() {}, stopPropagation() { stopped = true; } });
    if (!stopped && !target.props.disabled) target.props.onClick({ detail });
    flush();
  }
  function fillSearch(value) {
    const input = all().find(n => n.type === "input" && n.props["aria-label"] === "Search leads");
    assert.ok(input && !input.props.disabled, "search input is available");
    input.props.onChange({ target: { value } }); flush();
  }
  function traverse(offset) {
    assert.ok(historyIndex + offset >= 0 && historyIndex + offset < history.length);
    historyIndex += offset; fakeWindow.location = new URL(history[historyIndex], "http://localhost:3230");
    transitionPending = false; pendingNavigation = undefined; dirty = true; flush();
  }
  flush();
  return { initialDemoLeads, click, button, flush, text, all, fillSearch, navigationCalls,
    url: () => fakeWindow.location.pathname + fakeWindow.location.search + fakeWindow.location.hash,
    history: () => [...history], back: () => traverse(-1), forward: () => traverse(1),
    deferNavigation: () => { deferNavigation = true; },
    finishNavigation: () => { if (pendingNavigation) commitNavigation(...pendingNavigation); pendingNavigation = undefined; deferNavigation = false; transitionPending = false; dirty = true; flush(); },
    visit: (href, render = true) => { commitNavigation("push", href); if (render) flush(); },
    tick: () => { intervals.forEach(fn => fn()); flush(); },
    lib: name => load(path.join(root, "lib", name + ".ts")),
    status: () => all().filter(n => n.props.role === "status").map(n => text(n)).join(" "), alerts: () => all().filter(n => n.props.role === "alert").map(n => text(n)).join(" ") };
}

const s = storage();
let ui = mount(s);
const seed = JSON.stringify(ui.initialDemoLeads);
assert.match(ui.text(), /Ahmed Rahman/);
assert.equal(s.data.has(key), false, "missing storage is not eagerly seeded");
assert.equal(s.calls.filter(([op]) => op !== "get").length, 0, "Review is read-only");
ui.click("Schedule callback");
s.fail = "set";
ui.click(/Tomorrow · 11:30 AM/);
assert.equal(ui.status(), "", "failed write has no success notice");
assert.match(ui.alerts(), /Could not save/);
assert.match(ui.text(), /Activity 3/);
assert.match(ui.text(), /Lead owner/);
assert.match(ui.text(), /Sara · Luxury adviser/);
assert.match(ui.text(), /Unsubmitted choice: Ahmed Rahman has a callback tomorrow/);
assert.equal(s.data.has(key), false);
s.fail = "";
ui.click("Retry saving action", 0); // keyboard activation is not blocked
assert.match(ui.status(), /callback tomorrow/);
assert.match(ui.text(), /Activity 4/);
assert.ok(ui.button(/Tomorrow · 11:30 AM/).props.disabled);
assert.ok(ui.button("Stop contact").props.disabled);
assert.equal(JSON.parse(s.data.get(key)).find(l => l.id === "ahmed-rahman").timelineItems.length, 4);
const saved = s.data.get(key);
ui.click(/Tomorrow · 11:30 AM/); // another tap on the settled target
ui.click("Stop contact", 2); // second mouse click falling onto a different control
assert.equal(s.data.get(key), saved);
assert.doesNotMatch(ui.text(), /Stop all contact/);
ui.click("Close action", 0);
ui = mount(s);
assert.match(ui.text(), /Activity 4/);
assert.match(ui.text(), /Tomorrow · 11:30 AM/);
assert.equal(ui.status(), "", "reload is not a new success");
assert.equal(s.data.get(key), saved);
s.fail = "remove";
ui.click("Reset fictional leads");
assert.match(ui.alerts(), /Could not reset/);
assert.equal(ui.status(), "");
assert.equal(s.data.get(key), saved);
assert.match(ui.text(), /Activity 4/);
s.fail = "";
ui.click("Reset fictional leads");
assert.match(ui.status(), /restored/);
assert.equal(s.data.has(key), false, "successful reset removes only the sample key");
assert.match(ui.text(), /Property consultation · confirmed/);
ui = mount(s);
assert.match(ui.text(), /Activity 3/);

// Two submissions before React gets to render: the handler-level latch must
// still write once, independently of the disabled DOM and click capture.
const rapidStore = storage(); const rapid = mount(rapidStore);
rapid.click("Schedule callback");
const submit = rapid.button(/Tomorrow · 11:30 AM/).props.onClick;
submit(); submit(); rapid.flush();
assert.equal(rapidStore.calls.filter(([op]) => op === "set").length, 1);
assert.equal(JSON.parse(rapidStore.data.get(key)).find(l => l.id === "ahmed-rahman").timelineItems.length, 4);
assert.match(rapid.status(), /callback tomorrow/);

// A failed write from an already saved snapshot preserves it byte-for-byte.
s.data.set(key, seed); ui = mount(s); ui.click("Assign adviser"); s.fail = "set";
ui.click(/Omar Investment/);
assert.equal(s.data.get(key), seed); assert.equal(ui.status(), ""); assert.match(ui.text(), /Activity 3/);
s.fail = ""; ui.click("Retry saving action");
assert.equal(JSON.parse(s.data.get(key)).find(l => l.id === "ahmed-rahman").timelineItems.length, 4);
ui.click("Close action");

for (const kind of ["get", "getter"]) {
  const denied = storage(); denied.data.set(key, seed);
  denied.fail = kind === "get" ? "get" : ""; denied.getterFails = kind === "getter";
  const blocked = mount(denied);
  assert.match(blocked.alerts(), /storage could not be read/);
  assert.doesNotMatch(blocked.text(), /Reset fictional leads|Schedule callback|Choose a lead/);
  blocked.click("Retry loading sample leads");
  assert.equal(denied.data.get(key), seed);
  assert.ok(denied.calls.every(([op]) => op === "get"));
  denied.fail = ""; denied.getterFails = false; blocked.click("Retry loading sample leads");
  assert.equal(blocked.alerts(), ""); assert.match(blocked.text(), /Activity 3/);
}

const malformed = JSON.parse(seed); malformed[0].appointments[0].startsAt = "not-a-date";
const badOwner = JSON.parse(seed); badOwner[0].owner = {};
const badPriority = JSON.parse(seed); badPriority[0].priority = null;
const duplicates = JSON.parse(seed); duplicates[0] = duplicates[1];
for (const raw of ["", "broken-json", "null", "[]", JSON.stringify(malformed), JSON.stringify(badOwner), JSON.stringify(badPriority), JSON.stringify(duplicates)]) {
  const corrupt = storage(); corrupt.data.set(key, raw);
  const blocked = mount(corrupt);
  assert.match(blocked.alerts(), /could not be validated/);
  assert.doesNotMatch(blocked.text(), /Reset fictional leads|Schedule callback/);
  blocked.click("Retry loading sample leads");
  assert.equal(corrupt.data.get(key), raw); assert.ok(corrupt.calls.every(([op]) => op === "get"));
  corrupt.data.set(key, seed); blocked.click("Retry loading sample leads");
  assert.equal(blocked.alerts(), ""); assert.match(blocked.text(), /Activity 3/);
}

// B6 changes only the chosen Sample D1 contract: DNC preserves a meeting.
const unchangedRules = storage(); const rules = mount(unchangedRules);
rules.click(/^MK Maya Khan/); rules.click("Stop contact"); rules.click("Keep active");
assert.equal(unchangedRules.data.has(key), false);
rules.click("Stop contact"); rules.click("Confirm stop");
const stopped = JSON.parse(unchangedRules.data.get(key)).find(l => l.id === "maya-khan");
assert.equal(stopped.status, "Do not contact"); assert.equal(stopped.appointments[0].status, "confirmed");
assert.equal(stopped.tasks.filter(task => task.type === "meeting-review" && task.status === "open").length, 1);
assert.equal(stopped.qualification.passed, true);
assert.equal(stopped.timelineItems.length, 6);
assert.match(rules.status(), /suppression list/);
rules.click("Confirm stop"); assert.equal(JSON.parse(unchangedRules.data.get(key))[0].timelineItems.length, 6);
const preview = storage(); preview.getterFails = true; const memoryOnly = mount(preview, null);
memoryOnly.click("Schedule callback"); memoryOnly.click(/Today · 7:30 PM/);
assert.match(memoryOnly.text(), /Activity 4/); assert.equal(preview.calls.length, 0);
for (const store of [s, unchangedRules, preview]) {
  assert.equal(store.data.get("propagent-setup-v1"), "original workspace");
  assert.equal(store.data.get("propagent-sample-setup-v1"), "original sample setup");
  const noteKeys = ui.initialDemoLeads.map(lead => `${key}:continuation-v1:${lead.id}`);
  assert.ok(store.calls.every(([op, target]) => target === key || (op === "remove" && noteKeys.includes(target))), "only the sample key and its own note sidecars may be reset");
}
console.log("PASS: component output + controlled storage: missing/read/getter/corrupt, failed write and retained choice, one-result retry, failed/successful reset, reload, settled clicks, keyboard handlers, read-only review, sample isolation, B6 Sample DNC contract and preserved qualification.");

// Reuse the controlled component host in B2; importing also reruns B1 assertions.
module.exports = { mount, storage, key };
