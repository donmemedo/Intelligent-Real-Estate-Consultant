"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MessageSquareText,
  Phone,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

type Memory = {
  channel: string;
  budget: string;
  intent: string;
  timeline: string;
  interest: string;
  owner: string;
  nextAction: string;
};

type Choice = {
  label: string;
  description: string;
  next: string;
  event: string;
  tone?: "primary" | "warning";
  memory?: Partial<Memory>;
};

type DemoNode = {
  actor: string;
  eyebrow: string;
  title: string;
  description: string;
  message?: string;
  systemNote?: string;
  choices: Choice[];
};

const initialMemory: Memory = {
  channel: "Not chosen",
  budget: "Unknown",
  intent: "Buy off-plan",
  timeline: "Unknown",
  interest: "Dubai Hills · 2 bedroom",
  owner: "Lead Agent",
  nextAction: "Choose the first response",
};

const nodes: Record<string, DemoNode> = {
  arrival: {
    actor: "Lead Agent",
    eyebrow: "Start with a new enquiry",
    title: "A new Meta lead just arrived",
    description: "Maya asked about a two-bedroom off-plan apartment in Dubai Hills. The ad and form context are already attached.",
    systemNote: "Number valid · no duplicate · contact is permitted in this simulation",
    choices: [
      {
        label: "Reply on WhatsApp",
        description: "Use the known ad context and ask one useful question.",
        next: "whatsapp",
        event: "WhatsApp Agent started a contextual reply.",
        tone: "primary",
        memory: { channel: "WhatsApp", budget: "Up to AED 2.2M", timeline: "This year", owner: "WhatsApp Agent", nextAction: "Continue the conversation" },
      },
      {
        label: "Try a voice call",
        description: "Check calling eligibility before placing anything.",
        next: "voice-check",
        event: "Voice eligibility check opened before a call.",
        memory: { channel: "Voice", owner: "Voice Agent", nextAction: "Confirm the permitted call path" },
      },
      {
        label: "Send directly to an adviser",
        description: "Skip AI qualification because the lead asked for a human.",
        next: "handoff",
        event: "Qualification stopped and a human handoff was prepared.",
        memory: { owner: "Routing queue", nextAction: "Assign an eligible adviser" },
      },
    ],
  },
  whatsapp: {
    actor: "WhatsApp Agent",
    eyebrow: "The lead replied",
    title: "Maya added useful context — and asked a question",
    description: "Her budget is up to AED 2.2M and she wants to buy this year. She asks whether the advertised 60/40 payment plan is still available.",
    message: "My budget is around 2.2M. Is the 60/40 plan in the ad still available?",
    choices: [
      {
        label: "Verify before answering",
        description: "Ask the Knowledge Agent for an approved, current answer.",
        next: "knowledge",
        event: "Payment-plan check simulated using fictional source content.",
        tone: "primary",
        memory: { budget: "Up to AED 2.2M", timeline: "This year", owner: "Knowledge Agent", nextAction: "Choose how to use the sample answer; availability remains unknown" },
      },
      {
        label: "Answer from the advertisement",
        description: "Use the ad copy without checking whether it is still current.",
        next: "guardrail",
        event: "An unverified answer was blocked before it reached the lead.",
        tone: "warning",
        memory: { budget: "Up to AED 2.2M", timeline: "This year", owner: "Knowledge Agent", nextAction: "Resolve the unsafe answer" },
      },
      {
        label: "Hand the question to a person",
        description: "Package everything already learned for an adviser.",
        next: "handoff",
        event: "The property question and known qualification were added to the handoff.",
        memory: { budget: "Up to AED 2.2M", timeline: "This year", owner: "Routing queue", nextAction: "Assign an eligible adviser" },
      },
    ],
  },
  "voice-check": {
    actor: "Voice Agent",
    eyebrow: "Eligibility before action",
    title: "A call is possible, but it needs a clear reason",
    description: "The current time is inside the permitted window. Maya did not explicitly request a call, so the safest first action is still the inbound WhatsApp path.",
    systemNote: "Contact window open · no DNC match · zero voice attempts today",
    choices: [
      {
        label: "Use WhatsApp first",
        description: "Continue from the lead's original digital enquiry.",
        next: "whatsapp",
        event: "The safer WhatsApp-first path was selected.",
        tone: "primary",
        memory: { channel: "WhatsApp", budget: "Up to AED 2.2M", timeline: "This year", owner: "WhatsApp Agent", nextAction: "Start the contextual reply" },
      },
      {
        label: "Simulate an approved call",
        description: "Assume the agency policy allows this campaign call.",
        next: "call-outcome",
        event: "A permitted demo call was placed.",
        memory: { channel: "Voice", owner: "Voice Agent", nextAction: "Record the call outcome" },
      },
      {
        label: "Ask a human to review",
        description: "Do not contact until someone confirms the route.",
        next: "complete-review",
        event: "The uncertain contact route was assigned for human review.",
        memory: { owner: "Manager", nextAction: "Approve the contact route" },
      },
    ],
  },
  "call-outcome": {
    actor: "Voice Agent",
    eyebrow: "Choose the simulated outcome",
    title: "What happened on the call?",
    description: "In a live product the provider would report this. Here you can explore how different outcomes create different next steps.",
    choices: [
      {
        label: "Maya answered",
        description: "She confirms the same budget and purchase timeline.",
        next: "qualified",
        event: "The call was answered and qualification was completed.",
        tone: "primary",
        memory: { budget: "Up to AED 2.2M", timeline: "This year", owner: "Orchestrator", nextAction: "Choose recommendation or handoff" },
      },
      {
        label: "No answer",
        description: "Create a compliant next attempt rather than treating it as rejection.",
        next: "retry",
        event: "No answer was recorded without marking the lead uninterested.",
        memory: { owner: "Follow-up scheduler", nextAction: "Choose the permitted follow-up" },
      },
      {
        label: "Maya requested a person",
        description: "Stop the AI conversation and prepare a fast handoff.",
        next: "handoff",
        event: "The customer requested a human during the call.",
        memory: { owner: "Routing queue", nextAction: "Assign an eligible adviser" },
      },
    ],
  },
  retry: {
    actor: "Follow-up scheduler",
    eyebrow: "No answer is not a dead end",
    title: "Choose the next permitted action",
    description: "The lead has not rejected the offer. The system must keep the attempt count and next owner visible.",
    choices: [
      {
        label: "Send a short WhatsApp message",
        description: "Continue in writing and invite Maya to choose a callback time.",
        next: "whatsapp",
        event: "A permitted WhatsApp follow-up was prepared.",
        tone: "primary",
        memory: { channel: "WhatsApp", budget: "Up to AED 2.2M", timeline: "This year", owner: "WhatsApp Agent", nextAction: "Wait for or process the reply" },
      },
      {
        label: "Schedule another call",
        description: "Set a different permitted time and keep ownership explicit.",
        next: "complete-retry",
        event: "A second attempt was scheduled within the configured cap.",
        memory: { owner: "Voice Agent", nextAction: "Call tomorrow at 11:30 AM" },
      },
    ],
  },
  guardrail: {
    actor: "Knowledge Agent",
    eyebrow: "Guardrail activated",
    title: "The answer was stopped before it could mislead the lead",
    description: "The advertisement is useful context, but it is not enough to promise a current payment plan. PropAgent keeps the conversation moving without inventing certainty.",
    systemNote: "Nothing unsafe was sent to the customer",
    choices: [
      {
        label: "Check approved sources",
        description: "Verify the payment plan and continue safely.",
        next: "knowledge",
        event: "The blocked answer was replaced with a simulated source check.",
        tone: "primary",
        memory: { owner: "Knowledge Agent", nextAction: "Choose how to use the sample answer; availability remains unknown" },
      },
      {
        label: "Escalate the question",
        description: "Let an adviser confirm the current commercial detail.",
        next: "handoff",
        event: "The unresolved payment-plan question was included in the handoff.",
        memory: { owner: "Routing queue", nextAction: "Assign an adviser to confirm the detail" },
      },
    ],
  },
  knowledge: {
    actor: "Knowledge Agent",
    eyebrow: "Source check simulated",
    title: "Sample 60/40 plan — availability remains unknown",
    description: "This fictional sheet illustrates a payment-plan answer. No real price, inventory or source has been verified.",
    systemNote: "Fictional sheet · 19 Sep 2026 · scenario day 21 Sep 2026",
    choices: [
      {
        label: "Answer and suggest matching options",
        description: "Continue with the fictional answer and an illustrative property option.",
        next: "qualified",
        event: "A sample answer and qualification outcome were simulated. Nothing was sent.",
        tone: "primary",
        memory: { owner: "Recommendation Agent", nextAction: "Prepare matching properties" },
      },
      {
        label: "Answer, then arrange a human call",
        description: "Prepare the sample answer and unresolved availability question for review.",
        next: "handoff",
        event: "The fictional answer and unresolved availability question were prepared for handoff.",
        memory: { owner: "Routing queue", nextAction: "Assign an adviser" },
      },
    ],
  },
  qualified: {
    actor: "Orchestrator",
    eyebrow: "Qualification complete",
    title: "The system now knows enough to choose a useful next step",
    description: "Budget, purpose, timing and property interest are available across agents. Choose how the journey should continue.",
    systemNote: "Intent + budget + timeline + property interest captured",
    choices: [
      {
        label: "Review one illustrative property",
        description: "Explore Hills Park as a story example, not a verified recommendation.",
        next: "recommendation",
        event: "Hills Park was opened as the story's single illustrative property.",
        tone: "primary",
        memory: { owner: "Recommendation Agent", nextAction: "Review Hills Park; price and availability are unverified" },
      },
      {
        label: "Arrange a call with an adviser",
        description: "Send the full context and agreed next step to a person.",
        next: "handoff",
        event: "A qualified human handoff was prepared.",
        memory: { owner: "Routing queue", nextAction: "Assign an eligible adviser" },
      },
      {
        label: "Move to nurture",
        description: "Use this when the lead is interested but not ready to act.",
        next: "complete-nurture",
        event: "The lead left active sales and entered permitted nurture.",
        memory: { owner: "Nurture journey", nextAction: "Review in 30 days" },
      },
    ],
  },
  recommendation: {
    actor: "Property Recommendation Agent",
    eyebrow: "One illustrative property",
    title: "Explore Hills Park with Maya",
    description: "This story names one project, not a ranked shortlist. Fit, price and availability still need evidence; no recommendation engine runs here.",
    choices: [
      {
        label: "Maya selects Hills Park",
        description: "Prepare the chosen project and open questions for a person.",
        next: "handoff",
        event: "Hills Park was selected and added to the adviser brief.",
        tone: "primary",
        memory: { interest: "Hills Park · 2 bedroom", owner: "Routing queue", nextAction: "Assign an adviser for availability" },
      },
      {
        label: "Maya wants cheaper alternatives",
        description: "Keep her intent but update the search constraint.",
        next: "complete-search",
        event: "The preference was updated for a broader follow-up search.",
        memory: { budget: "Under AED 2M", interest: "Alternative area · 2 bedroom", owner: "Recommendation Agent", nextAction: "Refresh the shortlist" },
      },
    ],
  },
  handoff: {
    actor: "Appointment Agent",
    eyebrow: "Human handoff",
    title: "Choose how to protect the customer promise",
    description: "The adviser receives the source, conversation summary, known qualification, open questions and the expected next action — not just a phone number.",
    systemNote: "CRM registration must succeed before reassignment timers begin",
    choices: [
      {
        label: "Adviser accepts in 90 seconds",
        description: "Book the agreed callback and make the owner visible.",
        next: "complete-handoff",
        event: "The adviser accepted and a callback was confirmed.",
        tone: "primary",
        memory: { owner: "Sara · Off-plan adviser", nextAction: "Callback at the agreed permitted time: tomorrow, 4:30 PM (Dubai)" },
      },
      {
        label: "No adviser responds",
        description: "Explore the five-minute alert and ten-minute reassignment path.",
        next: "escalation",
        event: "The first adviser did not record an action.",
        memory: { owner: "Sales manager", nextAction: "Review the stalled handoff" },
      },
    ],
  },
  escalation: {
    actor: "Manager & Sales Coach",
    eyebrow: "Handoff protection",
    title: "The lead is stalled, but not abandoned",
    description: "After five working minutes the manager is alerted. After ten minutes without action, the agency may reassign if that setting is enabled.",
    choices: [
      {
        label: "Reassign to the next adviser",
        description: "Use the agency's approved fallback routing.",
        next: "complete-handoff",
        event: "The lead was reassigned with its full context intact.",
        tone: "primary",
        memory: { owner: "Omar · Available adviser", nextAction: "Call within 5 minutes" },
      },
      {
        label: "Keep ownership and alert manager",
        description: "Use when automatic reassignment is disabled.",
        next: "complete-handoff",
        event: "The manager accepted responsibility for the stalled lead.",
        memory: { owner: "Sales manager", nextAction: "Resolve ownership now" },
      },
    ],
  },
  "complete-handoff": {
    actor: "Manager view",
    eyebrow: "Story branch complete",
    title: "The selected next step remains visible",
    description: "This ends the walkthrough branch, not the work. The owner and next action below reflect your choice; no live handoff or call occurred.",
    choices: [],
  },
  "complete-nurture": {
    actor: "Manager view",
    eyebrow: "Story branch complete",
    title: "The selected future action is still pending",
    description: "Your choice may be a callback, a later review or a revised property search. It remains pending below; ending the story does not complete follow-up.",
    choices: [],
  },
  "complete-retry": {
    actor: "Follow-up scheduler",
    eyebrow: "Next attempt scheduled",
    title: "The lead stays in active follow-up",
    description: "No answer is not rejection. The next call has an owner and a scheduled time. Eligibility and attempt limits must be checked again before the call.",
    choices: [],
  },
  "complete-search": {
    actor: "Property Recommendation Agent",
    eyebrow: "Search updated",
    title: "The search continues with the revised budget",
    description: "Maya still wants to buy. Her new budget replaces the old limit, and the next shortlist must use it. Asking for cheaper options does not move her to nurture.",
    choices: [],
  },
  "complete-review": {
    actor: "Manager",
    eyebrow: "Contact held for review",
    title: "No outreach until the contact route is approved",
    description: "The manager owns the eligibility review. This is not a sales callback or permission to contact the lead. The approved route must pass the checks before outreach resumes.",
    choices: [],
  },
};

export function GuidedProductDemo() {
  const demo = useRef<HTMLDivElement>(null);
  useEffect(() => { if (demo.current) demo.current.dataset.ready = "true"; }, []);
  const [nodeId, setNodeId] = useState("arrival");
  const [memory, setMemory] = useState<Memory>(initialMemory);
  const [events, setEvents] = useState<string[]>(["Lead received from Meta with campaign context."]);
  const [history, setHistory] = useState<{ node: string; memory: Memory; events: string[] }[]>([]);
  const node = nodes[nodeId];
  const completed = node.choices.length === 0;


  function choose(choice: Choice) {
    setHistory((current) => [...current, { node: nodeId, memory, events }]);
    setMemory((current) => ({ ...current, ...choice.memory }));
    setEvents((current) => [...current, choice.event]);
    setNodeId(choice.next);
  }

  function goBack() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setNodeId(previous.node);
    setMemory(previous.memory);
    setEvents(previous.events);
    setHistory((current) => current.slice(0, -1));
  }

  function restart() {
    setNodeId("arrival");
    setMemory(initialMemory);
    setEvents(["Lead received from Meta with campaign context."]);
    setHistory([]);
  }

  return (
    <div className="guided-demo-layout" ref={demo}>
      <aside className="demo-context panel">
        <div className="context-head">
          <span className="lead-avatar">MK</span>
          <div><strong>Maya Khan</strong><small>Fictional Meta lead</small></div>
        </div>

        <div className="journey-progress-copy">
          <span>{completed ? "Story branch complete" : "Choices explored"}</span><strong>{history.length}</strong>
        </div>

        <div className="memory-list">
          <MemoryRow label="Channel" value={memory.channel} />
          <MemoryRow label="Intent" value={memory.intent} />
          <MemoryRow label="Budget" value={memory.budget} />
          <MemoryRow label="Timeline" value={memory.timeline} />
          <MemoryRow label="Interest" value={memory.interest} />
        </div>

        <div className="ownership-card">
          <UserRoundCheck size={17} />
          <div><span>Current owner</span><strong>{memory.owner}</strong><small>{memory.nextAction}</small></div>
        </div>
      </aside>

      <main className="demo-decision panel">
        <p className="home-context">Fictional story · 21 Sep 2026, Dubai. Today/tomorrow refer to this scenario, not the time of local activity recording. No messages, calls or source verification occur.</p>
        <div className="decision-topline">
          <span className="agent-chip"><Bot size={14} /> {node.actor}</span>
          <span className="decision-step">Decision {events.length}</span>
        </div>
        <span className="eyebrow">{node.eyebrow}</span>
        <h2>{node.title}</h2>
        <p className="decision-description">{node.description}</p>
        <div className="mobile-context-summary">
          <span><strong>Owner</strong>{memory.owner}</span>
          <span><strong>Known</strong>{memory.budget === "Unknown" ? "Intent and property" : "Intent, budget and timeline"}</span>
        </div>

        {node.message && (
          <div className="customer-message"><MessageSquareText size={17} /><span>{node.message}</span></div>
        )}
        {node.systemNote && (
          <div className="system-note"><ShieldCheck size={16} /><span>{node.systemNote}</span></div>
        )}

        {completed ? (
          <div className="completion-card">
            <CheckCircle2 size={26} />
            <div><strong>{memory.nextAction}</strong><span>Owner: {memory.owner}</span></div>
          </div>
        ) : (
          <div className="decision-choices">
            <span>What should happen next?</span>
            {node.choices.map((choice) => (
              <button
                className={choice.tone === "warning" ? "choice-card warning" : choice.tone === "primary" ? "choice-card primary-choice" : "choice-card"}
                key={choice.label}
                onClick={() => choose(choice)}
                type="button"
              >
                <span className="choice-icon">
                  {choice.tone === "warning" ? <CircleAlert size={17} /> : choice.label.toLowerCase().includes("call") ? <Phone size={17} /> : <ArrowRight size={17} />}
                </span>
                <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        )}

        <div className="decision-footer">
          <button disabled={!history.length} onClick={goBack} type="button"><ArrowLeft size={15} /> Undo last choice</button>
          <button onClick={restart} type="button"><RotateCcw size={15} /> Start again</button>
        </div>
        {completed && <div className="walkthrough-next"><p>Next, try the agency setup. The lead inbox is a separate set of sample records for practising everyday actions.</p><Link className="button primary" href="/setup?mode=sample">Continue to setup <ArrowRight size={16} /></Link><Link className="text-link" href="/leads?mode=sample">Explore sample leads</Link></div>}
      </main>

      <aside className="event-stream panel">
        <div className="event-stream-head"><div><span className="eyebrow">Simulated choices</span><h3>Story log</h3></div><Clock3 size={18} /></div>
        <p>This explains the product while you use it. New events appear after every choice.</p>
        <ol>
          {events.map((event, index) => (
            <li className={index === events.length - 1 ? "latest" : ""} key={`${event}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{event}</p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function MemoryRow({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
