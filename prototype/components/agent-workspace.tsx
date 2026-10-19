"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDot, Settings2, ShieldAlert } from "lucide-react";
import { AgentJourneyWorkbench } from "@/components/agent-journey-workbench";
import { PrototypeShell } from "@/components/prototype-shell";
import { useSetup } from "@/components/setup-state";
import { getAgentWorkspaceState } from "@/lib/agent-state";
import type { JourneyDefinition } from "@/lib/prototype-data";
import type { JourneyScenario } from "@/lib/journey-scenarios";

export function AgentWorkspace({
  agent,
  scenarios,
  sampleMode = false,
  reviewPosition,
  reviewTotal,
  nextAgent,
}: {
  agent: JourneyDefinition;
  scenarios: JourneyScenario[];
  sampleMode?: boolean;
  reviewPosition: number;
  reviewTotal: number;
  nextAgent?: JourneyDefinition;
}) {
  const { state: setup } = useSetup();
  const state = getAgentWorkspaceState(agent.id, setup);
  const Icon = state.tone === "blocked" ? ShieldAlert : state.tone === "setup" ? Settings2 : CheckCircle2;

  const route = (href: string) => sampleMode ? `${href}${href.includes("?") ? "&" : "?"}mode=sample` : href;

  return <PrototypeShell eyebrow={agent.role} title={agent.name} description={agent.promise} sampleMode={sampleMode}>
    <div className="agent-review-nav">
      <Link className="back-link" href={route("/team")}><ArrowLeft size={15} /> Back to AI team</Link>
      <span>Workspace {reviewPosition} of {reviewTotal}</span>
    </div>

    <section className={`agent-detail-hero panel agent-state-${state.tone}`}>
      <div>
        <span className={`status-label state-${state.tone}`}><CircleDot size={11} /> {state.label}</span>
        <h2>{state.tone === "setup" ? "Review the scenarios now; finish setup when ready" : state.tone === "blocked" ? "The experience is reviewable; live use is not" : state.tone === "planned" ? "This role is documented for later" : "The outcome this role owns"}</h2>
        <p>{state.reason}</p>
        {state.tone === "setup" && state.setupStep && <Link className="inline-state-action" href={route(`/setup?step=${state.setupStep}`)}>Continue setup <ArrowRight size={15} /></Link>}
      </div>
      <div className="agent-outcome-mark"><Icon size={25} /><span>{state.tone === "blocked" ? "No live activation" : state.tone === "planned" ? "Outside current V0" : "Safe fictional review"}</span></div>
    </section>

    <section className="agent-flow-section">
      <div className="section-heading">
        <div><span className="eyebrow">Workspace scenarios</span><h2>See the decision, result and next owner</h2></div>
        <p className="section-helper">Choose a scenario, advance through three steps, then compare both outcomes. These fictional reviews do not change the sample lead inbox.</p>
      </div>
      <AgentJourneyWorkbench scenarios={scenarios} />
    </section>

    <div className="page-end-actions">
      {nextAgent
        ? <Link className="button primary" href={route(`/agents/${nextAgent.id}`)}>Next workspace: {nextAgent.name} <ArrowRight size={17} /></Link>
        : <Link className="button primary" href={route("/team")}>Finish workspace review <ArrowRight size={17} /></Link>}
      <Link className="button ghost" href={route("/journey")}>See the full lead story</Link>
    </div>
  </PrototypeShell>;
}
