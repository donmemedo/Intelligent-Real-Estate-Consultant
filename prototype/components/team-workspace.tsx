"use client";

import Link from "next/link";
import { ArrowRight, Bot, CircleDot, Settings2, ShieldAlert } from "lucide-react";
import { PrototypeShell } from "@/components/prototype-shell";
import { useSetup } from "@/components/setup-state";
import { getAgentWorkspaceState } from "@/lib/agent-state";
import { journeys } from "@/lib/prototype-data";

export function TeamWorkspace({ sampleMode = false }: { sampleMode?: boolean }) {
  const { state: setup } = useSetup();
  const agents = journeys.map(agent => ({ agent, state: getAgentWorkspaceState(agent.id, setup) }));
  const ready = agents.filter(item => item.state.tone === "ready").length;
  const needsSetup = agents.filter(item => item.state.tone === "setup").length;
  const limited = agents.filter(item => item.state.tone === "blocked" || item.state.tone === "planned").length;

  const route = (href: string) => sampleMode ? `${href}${href.includes("?") ? "&" : "?"}mode=sample` : href;

  return <PrototypeShell
    eyebrow="Your AI team"
    title="Every role has one clear job"
    description="Start with the result you need. Each workspace shows what the role owns, what it needs and what happens next."
    sampleMode={sampleMode}
  >
    <section className="team-intro panel">
      <div className="team-intro-icon"><Bot size={26} /></div>
      <div><h2>Nine agent workspaces. One shared lead journey.</h2><p>Start with the guided story, then explore each role. The Lead journey card brings their work together; it is not an extra agent.</p></div>
      <Link className="button secondary" href={route("/demo")}>Try the guided lead story <ArrowRight size={17} /></Link>
    </section>

    <section className="team-status-summary" aria-label="AI team prototype status">
      <div><strong>{ready}</strong><span>Ready to review or test</span></div>
      <div><strong>{needsSetup}</strong><span>Need a setup step</span></div>
      <div><strong>{limited}</strong><span>Blocked or planned</span></div>
      <p><CircleDot size={14} /> Counts cover all 10 review workspaces. These are prototype readiness states, not claims that live agents are running.</p>
    </section>

    <section className="agent-grid">
      {agents.map(({ agent, state }) => (
        <article className={`agent-card accent-${agent.accent}`} key={agent.id}>
          <div className="agent-card-top">
            <span className="agent-symbol"><Bot size={19} /></span>
            <span className={`status-label state-${state.tone}`}><CircleDot size={12} /> {state.label}</span>
          </div>
          <span className="agent-role">{agent.role}</span>
          <h2>{agent.name}</h2>
          <p>{agent.promise}</p>
          <div className="agent-state-reason">{state.tone === "blocked" ? <ShieldAlert size={14} /> : state.tone === "setup" ? <Settings2 size={14} /> : <CircleDot size={12} />}<span>{state.reason}</span></div>
          <div className="flow-preview">
            {agent.flows.slice(0, 3).map(flow => <span key={flow}>{flow}</span>)}
          </div>
          <div className="agent-card-actions">
            <Link className="agent-card-primary" href={route(state.tone === "setup" && state.setupStep ? `/setup?step=${state.setupStep}` : `/agents/${agent.id}`)}>{state.actionLabel} <ArrowRight size={16} /></Link>
            {state.tone === "setup" && <Link className="agent-card-review" href={route(`/agents/${agent.id}`)}>Review scenarios safely</Link>}
          </div>
        </article>
      ))}
    </section>
  </PrototypeShell>;
}
