// Browser checks for the founder walkthrough. Uses an isolated temporary profile.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const origin = process.env.PROTOTYPE_URL || "http://localhost:3200";
const output = await mkdtemp(join(tmpdir(), "propagent-walkthrough-"));
const fixtureSource = await readFile(new URL("../lib/journey-scenarios.ts", import.meta.url), "utf8");
const fixturePath = join(output, "journey-scenarios.mjs");
await writeFile(fixturePath, ts.transpileModule(fixtureSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText);
const { journeyScenarios } = await import(pathToFileURL(fixturePath).href);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--disable-gpu", "--no-first-run", "--disable-background-networking",
  "--remote-debugging-port=0", `--user-data-dir=${join(output, "profile")}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = "";
    const timeout = setTimeout(() => reject(new Error("Chrome did not start")), 10000);
    chrome.on("error", reject);
    chrome.stderr.on("data", chunk => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const port = new URL(endpoint).port;
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  const errors = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  };
  await new Promise(resolve => { ws.onopen = resolve; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable");
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 80; i++) {
      try { if (await evaluate(expression)) return; } catch { /* Navigation can replace the execution context once. */ }
      await new Promise(r => setTimeout(r, 50));
    }
    const body = await evaluate('document.body?.innerText?.slice(0, 6500)');
    throw new Error(`UI never became ready: ${expression}\nVisible text: ${body}`);
  };
  const go = async (route, expression) => {
    await send("Page.navigate", { url: origin + route });
    await wait(`location.href === ${JSON.stringify(origin + route)}`);
    await wait(expression || 'document.readyState === "complete"');
  };
  const click = async text => {
    const found = await evaluate(`(() => { const el = [...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled); if (!el) return false; el.click(); return true; })()`);
    assert.ok(found, `Control available: ${text}`);
  };
  const clickContaining = async text => {
    const found = await evaluate(`(() => { const el = [...document.querySelectorAll('button,a')].find(e => e.textContent.includes(${JSON.stringify(text)}) && !e.disabled); if (!el) return false; el.click(); return true; })()`);
    assert.ok(found, `Control available containing: ${text}`);
  };
  const screenshot = async name => {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(output, `${name}.png`), Buffer.from(result.data, "base64"));
  };
  const viewport = (width, height = 900) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await viewport(1280);
  await go("/setup", '!!document.querySelector("#setup-agency")');
  await evaluate(`(() => { const input = document.querySelector('#setup-agency'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await wait('[...document.querySelectorAll("button")].find(e => e.textContent.includes("Save and continue"))?.disabled');
  await evaluate(`(() => { const input = document.querySelector('#setup-agency'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Harbour & Key Real Estate'); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await wait('[...document.querySelectorAll("button")].some(e => e.textContent.includes("Save and continue") && !e.disabled)');
  await click("Save and continue");
  await wait('!!document.querySelector("#setup-source")');
  await go("/home", 'document.querySelector("progress")?.value === 1');
  await click("Continue setup");
  await wait('!!document.querySelector("#setup-source")');
  for (const next of ["crm", "whatsapp", "knowledge", "routing", "voice"]) {
    await click("Save and continue");
    await wait(`!!document.querySelector('#setup-${next}')`);
  }
  await click("Leave voice for later");
  await wait('document.body.innerText.includes("Run sample check")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(e => e.textContent.includes("Finish setup preview")).disabled'), true);
  await click("Run sample check");
  await wait('!!document.querySelector(".setup-test-result")');
  await click("Finish setup preview");
  await wait('document.body.innerText.includes("Your demo workspace is ready")');
  await screenshot("setup-complete");
  await go("/setup", 'document.body.innerText.includes("Your demo workspace is ready")');
  await go("/home", 'document.body.innerText.includes("Your setup preview is ready")');
  await go("/home?mode=sample", 'document.body.innerText.includes("Review callback")');
  await click("Review callback");
  await wait('document.querySelector(".identity-title h2")?.textContent === "Ahmed Rahman"');
  await click("Stop contact"); await click("Confirm stop");
  await wait('document.body.innerText.includes("Contact is stopped")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(e => e.textContent.includes("Assign adviser"))'), false);
  await go("/leads?mode=sample&lead=ahmed-rahman", 'document.body.innerText.includes("Contact is stopped")');
  await go("/home?mode=sample", 'document.body.innerText.includes("Review property price")'); await click("Review property price");
  await wait('document.querySelector(".identity-title h2")?.textContent === "Elena Petrova"');
  console.log("PASS: saved setup resumes, optional voice can be skipped, finish requires sample check, Home matches completion, lead links select correct people, stop persists.");

  // Fresh setup for layout inspection, isolated from the user's browser state.
  await evaluate('localStorage.removeItem("propagent-setup-v1")');
  await go("/welcome", 'document.body.innerText.includes("1. Follow a lead")');
  assert.equal(await evaluate('[...document.querySelectorAll("a")].find(e => e.textContent.includes("3. Try the workspace"))?.getAttribute("href")'), "/leads?mode=sample", "Walkthrough opens the promised fictional workspace");
  await go("/leads", 'document.body.innerText.includes("Your leads will appear here")');
  assert.equal(await evaluate('document.body.innerText.includes("Maya Khan")'), false, "Real Leads does not show fictional records");
  await go("/leads?mode=sample", 'document.body.innerText.includes("Maya Khan")');
  await go("/team", 'document.body.innerText.includes("prototype readiness states")');
  assert.equal(await evaluate('[...document.querySelectorAll("a")].some(e => e.textContent.includes("Open workspace"))'), true, "Reviewable agents open a workspace");
  assert.equal(await evaluate('[...document.querySelectorAll("a")].some(e => e.textContent.includes("Review scenarios safely") && e.getAttribute("href") === "/agents/lead-agent")'), true, "Setup-gated roles remain safely reviewable");
  const sampleSetup = { selected: 7, completed: ["agency", "source", "crm", "whatsapp", "knowledge", "routing", "test"], skipped: ["voice"], values: { agency: "Demo agency", source: "Meta Ads", crm: "Demo CRM", whatsapp: "Agency number", knowledge: "Approved sheet", routing: "Sara", voice: "" } };
  await evaluate(`localStorage.setItem("propagent-sample-setup-v1", ${JSON.stringify(JSON.stringify(sampleSetup))})`);
  await go("/team?mode=sample", 'document.body.innerText.includes("Sample workspace")');
  await wait('document.body.innerText.includes("Ready to test")');
  const journeyRoutes = [
    ["lead-journey", "Lead journey"], ["lead-agent", "Lead Agent"], ["whatsapp-agent", "WhatsApp Agent"],
    ["voice-agent", "Voice Agent"], ["knowledge-agent", "Knowledge Agent"], ["recommendation-agent", "Property Recommendation Agent"],
    ["appointment-agent", "Appointment Agent"], ["manager-agent", "Manager & Sales Coach"], ["email-agent", "Email Agent"],
    ["orchestrator-memory", "Orchestrator & Shared Memory"],
  ];
  for (const [id, title] of journeyRoutes) {
    await go(`/agents/${id}`, `document.querySelector("h1")?.textContent === ${JSON.stringify(title)} && !!document.querySelector('.workbench[data-ready="true"]')`);
    for (const [index, scenario] of journeyScenarios[id].entries()) {
      await wait(`document.querySelector('.scenario-heading h2')?.textContent === ${JSON.stringify(scenario.title)}`);
      assert.equal(await evaluate('document.querySelector(".result-card.owner strong").textContent'), "Assigned after the decision", `${id}/${index}: fresh scenario clears ownership`);
      await click("Start simulation");
      await wait('document.body.innerText.includes("Step 2 of 3")');
      await click("Run next step");
      await wait('document.body.innerText.includes("Step 3 of 3")');
      await click("Run next step");
      await wait('!!document.querySelector(".scenario-branch-choice")');
      await clickContaining("Complete the normal path");
      await wait('!!document.querySelector(".result-card.success")');
      assert.equal(await evaluate('document.querySelector(".result-card.success strong").textContent'), scenario.result);
      assert.equal(await evaluate('document.querySelector(".result-card.owner strong").textContent'), scenario.nextOwner);
      await click("Try the exception outcome");
      await wait('!!document.querySelector(".warning-result")');
      assert.equal(await evaluate('document.querySelector(".warning-result strong").textContent'), scenario.exception);
      const owner = await evaluate('document.querySelector(".result-card.owner strong").textContent');
      assert.equal(owner, scenario.exceptionOwner ?? scenario.nextOwner, `${id}/${index}: exception owns its next action`);
      if (id === "lead-agent" && index === 1) assert.match(owner, /hold contact/);
      if (id === "appointment-agent" && index === 0) assert.match(owner, /manager/i);
      await click("Try the normal outcome");
      await wait('!!document.querySelector(".result-card.success")');
      if (index < 3) await click("Next scenario");
    }
    await click("Restart");
    await wait('!!document.querySelector(".pending-result")');
    assert.equal(await evaluate('document.querySelector(".result-card.owner strong").textContent'), "Assigned after the decision");
  }
  console.log("PASS: all 40 scenarios across 10 workspaces render both outcomes (80 results), branch-specific owners, next-scenario navigation and restart.");
  await go("/journey", '!!document.querySelector(\'.journey-demo[data-ready="true"]\')');
  await clickContaining("Manager & Sales Coach");
  await wait('document.body.innerText.includes("Stage 7 of 7")');
  assert.equal(await evaluate('[...document.querySelectorAll("a")].some(e => e.textContent.includes("Try the branching decisions") && e.getAttribute("href") === "/demo")'), true, "The overview hands deeper decisions to the branching demo");
  await go("/journey?mode=sample", '!!document.querySelector(\'.journey-demo[data-ready="true"]\')');
  await clickContaining("Manager & Sales Coach");
  await wait('document.body.innerText.includes("Stage 7 of 7")');
  assert.equal(await evaluate('[...document.querySelectorAll("a")].find(e => e.textContent.includes("Try the branching decisions"))?.getAttribute("href")'), "/demo?mode=sample", "Sample mode survives overview-to-demo navigation");

  await go("/demo", '!!document.querySelector(\'.guided-demo-layout[data-ready="true"]\')');
  const visited = new Set(); let edges = 0;
  const demoSnapshot = () => evaluate(`JSON.stringify({ title: document.querySelector('.demo-decision h2').textContent, memory: document.querySelector('.demo-context').innerText, events: document.querySelector('.event-stream').innerText })`);
  async function exploreChoices() {
    const title = await evaluate('document.querySelector(".demo-decision h2").textContent');
    if (visited.has(title)) return;
    visited.add(title);
    const labels = await evaluate('[...document.querySelectorAll(".choice-card strong")].map(e => e.textContent)');
    for (const label of labels) {
      const before = await demoSnapshot();
      await clickContaining(label);
      await wait(`document.querySelector('.demo-decision h2')?.textContent !== ${JSON.stringify(title)}`);
      assert.ok(await evaluate('document.querySelector(".ownership-card strong").textContent'), `${label}: owner is visible`);
      edges++;
      if (label === "Schedule another call") assert.equal(await evaluate('document.querySelector(".demo-decision h2").textContent'), "The lead stays in active follow-up");
      if (label === "Maya wants cheaper alternatives") {
        assert.equal(await evaluate('document.querySelector(".demo-decision h2").textContent'), "The search continues with the revised budget");
        assert.ok(await evaluate('document.querySelector(".memory-list").innerText.includes("Under AED 2M")'));
      }
      if (label === "Ask a human to review") {
        assert.equal(await evaluate('document.querySelector(".demo-decision h2").textContent'), "No outreach until the contact route is approved");
        assert.equal(await evaluate('document.querySelectorAll(".choice-card").length'), 0);
      }
      await exploreChoices();
      await click("Undo last choice");
      await wait(`document.querySelector('.demo-decision h2')?.textContent === ${JSON.stringify(title)}`);
      assert.equal(await demoSnapshot(), before, `${label}: undo restores memory and history`);
    }
  }
  await exploreChoices();
  assert.equal(visited.size, 16, "Every branching-demo state was visited");
  assert.equal(edges, 27, "Every branching-demo choice was clicked");
  await clickContaining("Reply on WhatsApp");
  await wait('document.querySelector(".demo-decision h2").textContent.includes("Maya added")');
  await click("Start again");
  await wait('document.querySelector(".demo-decision h2").textContent === "A new Meta lead just arrived"');
  assert.ok(await evaluate('document.querySelector(".memory-list").innerText.includes("Unknown")'));
  console.log(`PASS: all ${edges} branching-demo choices across ${visited.size} states, corrected retry/search/review outcomes, undo and restart.`);

  // Integration: real keyed notes component + Founder URL/storage/handoff.
  const danielRoute = "/leads?mode=sample&preview=sample&state=sample&lead=daniel-wu&tab=overview";
  const notesReady = '!!document.querySelector(\'.continuation-panel[data-ready="true"]\')';
  const fillNote = async (selector, value) => {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  };
  await go(danielRoute, notesReady);
  const leadSnapshot = await evaluate('localStorage.getItem("propagent-demo-leads-v2")');
  await evaluate('document.querySelector(".continuation-evidence").open = true');
  await click("Open original message");
  await wait('document.activeElement?.id === "lead-message-daniel-wu-m1"');
  assert.equal(await evaluate('new URLSearchParams(location.search).get("tab")'), "conversation");
  for (const param of ["mode", "preview", "state"]) assert.equal(await evaluate(`new URLSearchParams(location.search).get(${JSON.stringify(param)})`), "sample");
  await evaluate('history.back()'); await wait(notesReady);
  await click("Correct interpretation");
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Save correction").disabled'), true);
  await fillNote(".continuation-panel textarea", "Customer timing needs a clearer follow-up discussion.");
  await fillNote(".continuation-panel input", "Review the original request before the next conversation.");
  await evaluate('window.__noteSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k.includes(":continuation-v1:")) throw Error("test quota"); return window.__noteSet.call(this,k,v); }');
  await click("Save correction");
  await wait('document.querySelector(".continuation-panel").textContent.includes("Could not save")');
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:daniel-wu")'), null);
  await evaluate('Storage.prototype.setItem = window.__noteSet; delete window.__noteSet');
  await click("Save correction");
  await wait('document.querySelector(".continuation-panel").textContent.includes("Correction saved")');
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2")'), leadSnapshot, "notes never overwrite Founder lead state");
  const danielNotes = await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:daniel-wu")');
  assert.equal(JSON.parse(danielNotes)[0].history.length, 1);
  assert.match(JSON.parse(danielNotes)[0].evidence.quote, /^Not this quarter/);
  await go(danielRoute, notesReady);
  assert.ok(await evaluate('document.querySelector(".continuation-panel").textContent.includes("Customer timing needs")'));
  await click("Correct interpretation");
  await fillNote(".continuation-panel textarea", "This draft must not leak to another lead");
  await clickContaining("Maya Khan");
  await wait('document.querySelector(".identity-title h2")?.textContent === "Maya Khan" && !!document.querySelector(\'.continuation-panel[data-ready="true"]\')');
  assert.equal(await evaluate('!!document.querySelector(".continuation-panel textarea")'), false);
  assert.equal(await evaluate('document.querySelector(".continuation-panel").textContent.includes("Customer timing needs")'), false);
  await click("Try a fictional rejection");
  await wait('document.querySelector(".continuation-panel h4")?.textContent === "Hills Park · illustrative property"');
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2")'), leadSnapshot);
  await click("Assign adviser");
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Correct interpretation").disabled'), true);
  await clickContaining("OmarInvestment");
  await wait('document.body.innerText.includes("requested a simulated handoff")');
  await click("Close action");
  const mayaNotes = await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:maya-khan")');
  const assigned = JSON.parse(await evaluate('localStorage.getItem("propagent-demo-leads-v2")')).find(l => l.id === "maya-khan");
  assert.equal(assigned.response.state, "paused");
  assert.equal(assigned.response.handoff.status, "requested");
  await click("Correct interpretation");
  await fillNote(".continuation-panel textarea", "Payment schedule needs a conversation with Omar.");
  await fillNote(".continuation-panel input", "Keep the original evidence visible for the receiving adviser.");
  await click("Save correction");
  await wait('document.querySelector(".continuation-panel").textContent.includes("Correction saved")');
  const afterNotes = JSON.parse(await evaluate('localStorage.getItem("propagent-demo-leads-v2")')).find(l => l.id === "maya-khan");
  assert.deepEqual(afterNotes, assigned, "correction leaves owner, paused handoff, tasks and meeting intact");
  assert.notEqual(await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:maya-khan")'), mayaNotes);
  await fillNote('input[aria-label="Search leads"]', "Daniel");
  await wait('document.body.innerText.includes("outside the search results")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Correct interpretation").disabled'), true);
  await click("Clear search");
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent === "Correct interpretation" && !b.disabled)');
  await screenshot("merged-notes-and-founder-handoff");
  await evaluate('document.querySelector(".continuation-panel").scrollIntoView({block:"center"})');
  await screenshot("merged-notes-desktop");
  await viewport(390, 844);
  await evaluate('document.querySelector(".continuation-panel").scrollIntoView({block:"start"})');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  await screenshot("merged-notes-mobile");
  await viewport(1280);
  await evaluate('window.__noteRemove = Storage.prototype.removeItem; Storage.prototype.removeItem = function(k) { if(k.includes(":continuation-v1:")) throw Error("test reset denied"); return window.__noteRemove.call(this,k); }');
  await clickContaining("Reset fictional leads");
  await wait('document.body.innerText.includes("some separately saved review notes could not be cleared")');
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2")'), null);
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:daniel-wu")'), danielNotes);
  await evaluate('Storage.prototype.removeItem = window.__noteRemove; delete window.__noteRemove');
  await clickContaining("Reset fictional leads");
  await wait('document.body.innerText.includes("leads and review notes were restored")');
  assert.equal(await evaluate('Object.keys(localStorage).some(k => k.startsWith("propagent-demo-leads-v2:continuation-v1:"))'), false);
  await go(danielRoute, notesReady);
  await evaluate('localStorage.setItem("propagent-demo-leads-v2:continuation-v1:daniel-wu", "invalid-notes")');
  await go(danielRoute, notesReady);
  await wait('document.querySelector(".continuation-panel").textContent.includes("could not be loaded")');
  assert.equal(await evaluate('localStorage.getItem("propagent-demo-leads-v2:continuation-v1:daniel-wu")'), "invalid-notes");
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Assign adviser")).disabled'), false, "broken optional notes do not block handoff");
  await clickContaining("Reset fictional leads");
  for (const [state, expected] of [["onboarding", "Get ready for your first lead"], ["ready", "Your setup preview is ready"], ["operational", "Review callback"], ["sample", "Review property price"]]) {
    await go(`/home?preview=${state}`, `document.body.innerText.includes(${JSON.stringify(expected)})`);
    assert.equal(await evaluate('document.querySelectorAll(".home-preview-control a").length'), 5);
    await screenshot(`founder-home-${state}`);
  }
  console.log("PASS: merged notes retain evidence and URL context; save failure/reload, lead isolation, read-only guards, Founder handoff preservation, partial reset/retry, corrupt-note recovery and all Home preview states.");
  for (const width of [390, 768, 1280]) {
    await viewport(width);
    for (const route of ["/welcome", "/setup", "/home", "/leads", "/leads?mode=sample", "/demo", "/team", "/journey", ...journeyRoutes.map(([id]) => `/agents/${id}`)]) {
      await go(route, route === "/setup" ? '!!document.querySelector("#setup-agency")' : 'document.readyState === "complete"');
      const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
      assert.equal(overflow, false, `${route} fits ${width}px`);
      await screenshot(`${route.slice(1).replaceAll(/[^a-z0-9-]/g, "-")}-${width}`);
    }
  }
  assert.deepEqual(errors, [], "No browser exceptions");
  console.log(`PASS: 18 page variants fit mobile, tablet and desktop. Screenshots: ${output}`);
} finally {
  ws?.close(); chrome.kill("SIGTERM");
}
