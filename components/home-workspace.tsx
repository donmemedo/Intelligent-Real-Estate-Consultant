"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PrototypeShell } from "./prototype-shell";
import { OperationalHome } from "./operational-home";
import { useSetup, SetupProvider } from "./setup-state";
import { SetupSummary } from "./setup-summary";
import { initialDemoLeads, demoPeriod, demoStorageKey } from "@/lib/demo-leads";
import { readLeadStorage, type LeadReadResult } from "@/lib/lead-storage";
import { getPrototypeWorkspace, getSetupReadiness, previewHomeState, resolveHomeState } from "@/lib/home-state";

const sampleHref = "/home?mode=sample";

function SafetyStatus() {
  return <section className="panel home-safety">
    <h2>Nothing goes live without your approval</h2>
    <p>This prototype cannot send customer messages, run live automation or connect accounts.</p>
    <dl><div><dt>Customer messaging</dt><dd>Not implemented</dd></div><div><dt>Automation</dt><dd>Not implemented</dd></div><div><dt>Connected channels</dt><dd>No live connector in this prototype</dd></div></dl>
  </section>;
}

function OnboardingHome({ readiness }: { readiness: ReturnType<typeof getSetupReadiness> }) {
  return <div className="day-zero">
    <section className="panel onboarding-main">
      <h2>Get ready for your first lead</h2>
    <p>Review the required setup choices, then practise with a fictional lead. No live response is enabled.</p>
      <p id="home-progress-label">{readiness.count} of {readiness.total} required steps complete</p>
      <progress aria-labelledby="home-progress-label" value={readiness.count} max={readiness.total} />
      <ul className="home-setup-checklist">{readiness.groups.map(group => <li key={group.title}>
        <Link href={"/setup?step=" + group.target}><strong>{group.title}</strong><span>{group.status}</span></Link>
        <p>{group.description}</p>
      </li>)}</ul>
      <Link className="button primary" href={"/setup?step=" + readiness.next}>Continue setup</Link>
    </section>
    <aside className="panel onboarding-value"><h2>What happens after setup</h2><ul>
      <li>New enquiries appear in one place</li><li>AI responds using approved information</li>
      <li>Qualified leads are handed to an adviser</li><li>Tasks and appointments appear on Home</li>
    </ul></aside>
    <SafetyStatus />
    <Link className="text-link explore-sample" href={sampleHref}>Explore sample workspace</Link>
  </div>;
}

function ReadyHome({ checks }: { checks: { label: string; ready: boolean }[] }) {
  return <section className="panel onboarding-main ready-home">
    <h2>Your setup preview is ready</h2>
    <p>Try a fictional lead. Real lead intake is not connected.</p>
    <p className="home-context">Setup preview only. Live connections and activation are not implemented.</p>
    <dl className="readiness-list">{checks.map(check => <div key={check.label}><dt>{check.label}</dt><dd>{check.ready ? "Ready for preview" : "Needs attention"}</dd></div>)}</dl>
    <div className="home-state-actions"><Link className="button primary" href="/demo?mode=sample">Test with a sample lead</Link><Link className="text-link" href="/setup?step=agency">Review setup</Link></div>
  </section>;
}

export function HomeWorkspace() {
  const query = useSearchParams();
  const { state: setup, ready } = useSetup();
  const [sampleRead, setSampleRead] = useState<LeadReadResult | null>(null);
  const workspace = getPrototypeWorkspace(setup);
  const actual = resolveHomeState(query.get("mode") === "sample", workspace);
  const override = previewHomeState(query.get("preview"));
  const state = override ?? actual;
  const readiness = getSetupReadiness(setup);
  // Fixtures for preview are read-only and do not update setup or real leads.
  const displayReadiness = override === "onboarding"
    ? getSetupReadiness({ selected: 0, completed: [], values: {} }) : readiness;
  const checks = override === "ready" ? workspace.checks.map(check => ({ ...check, ready: true })) : workspace.checks;
  useEffect(() => {
    if (state !== "sample") return;
    const refresh = () => setSampleRead(readLeadStorage(() => window.localStorage, demoStorageKey, initialDemoLeads));
    const timer = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [state]);
  const dashboard = state === "sample" || state === "operational";
  return <PrototypeShell eyebrow={dashboard ? demoPeriod : "Workspace setup"} title="Your agency at a glance"
    description={state === "onboarding" ? "Complete the essentials before your first lead arrives." : state === "ready" ? "Your next step starts with a safe test." : "Activity, attention and the next step."}
    sampleMode={state === "sample"} homeBadge={state === "sample" ? "Sample workspace · No customer actions" : undefined}>
    {!ready ? <p role="status">Loading your workspace…</p> : <>
      <nav className="home-preview-control" aria-label="Preview state">
        <span>Preview state:</span>{[["onboarding", "Day Zero"], ["ready", "Ready"], ["operational", "Operational"], ["sample", "Sample"]].map(([value, label]) =>
          <Link key={value} href={"/home?preview=" + value} aria-current={override === value ? "page" : undefined}>{label}</Link>)}
        {override && <Link href="/home">Exit preview</Link>}
      </nav>
      {override && <p className="home-preview-note" role="status">Development preview — simulated state, no workspace data is changed.</p>}
      {state === "sample" && <Link className="text-link home-return" href="/home">Back to my workspace</Link>}
      {state === "onboarding" && <OnboardingHome readiness={displayReadiness} />}
      {state === "ready" && <ReadyHome checks={checks} />}
      {state === "operational" && <>
        {!workspace.requiredSetupComplete && <div className="home-setup-warning" role="status">Required setup needs attention. <Link href={"/setup?step=" + readiness.next}>Complete essential setup</Link></div>}
        <OperationalHome leads={override ? initialDemoLeads : workspace.realLeads} sampleData={!!override} navigationSearch={query.toString()} />
      </>}
      {state === "sample" && <><OperationalHome leads={sampleRead?.kind === "ready" ? sampleRead.leads : []} sampleData navigationSearch={query.toString()}
        loadState={sampleRead?.kind ?? "loading"} onRetry={() => setSampleRead(readLeadStorage(() => window.localStorage, demoStorageKey, initialDemoLeads))} /><SetupProvider sample><SetupSummary compact /></SetupProvider></>}
    </>}
  </PrototypeShell>;
}
