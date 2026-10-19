"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpen, Bot, BrainCircuit, Building2, CalendarCheck, Inbox, Mail, MessageCircle, Phone, Route, TrendingUp, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { getAgentWorkspaceState } from "@/lib/agent-state";
import type { SetupSnapshot } from "@/lib/home-state";
import { journeyScenarios } from "@/lib/journey-scenarios";
import { journeys, type JourneyDefinition } from "@/lib/prototype-data";

// A partly configured sample workspace, so readiness differs across roles.
const setup: SetupSnapshot = { selected: 0, completed: ["source", "crm", "knowledge"], values: { source: "Meta lead forms", crm: "Sample CRM", knowledge: "Approved listings" } };
const tone = { ready: "green", setup: "amber", blocked: "red", planned: "gray" } as const;
const icons: Record<string, LucideIcon> = {
  "lead-journey": Route, "lead-agent": Inbox, "whatsapp-agent": MessageCircle, "voice-agent": Phone, "knowledge-agent": BookOpen,
  "recommendation-agent": Building2, "appointment-agent": CalendarCheck, "manager-agent": TrendingUp, "email-agent": Mail, "orchestrator-memory": BrainCircuit,
};

function AgentModal({ agent, onClose }: { agent: JourneyDefinition; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);
  const state = getAgentWorkspaceState(agent.id, setup);
  const Icon = icons[agent.id] ?? Bot;

  return (
    <div className="modal-layer">
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      {/* Same layoutId as the card: the card itself grows into this view and shrinks back on close. */}
      <motion.article layoutId={`agent-${agent.id}`} className="modal" data-accent={agent.accent} style={{ borderRadius: 28 }} role="dialog" aria-modal="true" aria-label={agent.name}>
        <motion.div className="modal-body" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
          <header className="modal-head">
            <span className="agent-icon"><Icon size={22} /></span>
            <div className="text"><p className="eyebrow">{agent.role}</p><h2 className="title-1">{agent.name}</h2></div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <p className="lede">{agent.promise}</p>
          <div className="inset"><span className="pill" data-tone={tone[state.tone]}>{state.label}</span><p className="muted small">{state.reason}</p></div>
          <ul className="chips">{agent.flows.map(f => <li key={f} className="chip">{f}</li>)}</ul>
          <h3 className="card-title">Scenarios</h3>
          <ol className="scenarios">
            {(journeyScenarios[agent.id] ?? []).map(s => (
              <li key={s.title} className="inset">
                <strong>{s.title}</strong>
                <p className="muted small">{s.trigger}</p>
                <ol className="steps">{s.steps.map((step, n) => <li key={n}>{step}</li>)}</ol>
                <p className="small"><b>Result:</b> {s.result}</p>
                <p className="small row"><ArrowRight size={14} /> Next owner <b>{s.nextOwner}</b></p>
                <p className="small note">Exception: {s.exception}</p>
              </li>
            ))}
          </ol>
        </motion.div>
      </motion.article>
    </div>
  );
}

export default function Team() {
  const [open, setOpen] = useState<string | null>(null);
  const agent = journeys.find(j => j.id === open);
  return (
    <div className="page">
      <PageHeader eyebrow={`${journeys.length} roles · one shared memory`} title="AI Team" />
      <div className="agent-grid">
        {journeys.map(j => {
          const state = getAgentWorkspaceState(j.id, setup);
          const Icon = icons[j.id] ?? Bot;
          return (
            <motion.button key={j.id} layoutId={`agent-${j.id}`} className="card agent-card" data-accent={j.accent} style={{ borderRadius: 22 }}
              whileTap={{ scale: 0.97 }} onClick={() => setOpen(j.id)}>
              <span className="agent-icon"><Icon size={20} /></span>
              <span className="eyebrow">{j.role}</span>
              <strong className="title-3">{j.name}</strong>
              <span className="muted small">{j.promise}</span>
              <span className="pill" data-tone={tone[state.tone]}>{state.label}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>{agent && <AgentModal key={agent.id} agent={agent} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}
