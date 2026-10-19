import type { DemoLead, LeadTask } from "./demo-leads";

// The two existing fictional destinations, not users or an authorization policy.
export const sampleAdvisers = [
  { id: "sara", name: "Sara", label: "Sara · Off-plan adviser", description: "Off-plan · English · Available" },
  { id: "omar", name: "Omar", label: "Omar · Investment adviser", description: "Investment · English/Arabic · Available" },
];
export const findSampleAdviser = (id?: string) => sampleAdvisers.find(adviser => adviser.id === id);
export type HandoffCommand = { kind: "request"; target: string } | { kind: "accept" | "return"; target: string; id: string };
type HandoffPlan = { kind: "change"; update: Partial<DemoLead>; title: string; detail: string } | { kind: "blocked" | "unchanged"; message: string };

export function planHandoff(lead: DemoLead, command: HandoffCommand): HandoffPlan {
  if (lead.status === "Do not contact") return { kind: "blocked", message: "Contact is blocked. Response control cannot be transferred or returned to AI." };
  const adviser = findSampleAdviser(command.target);
  if (!adviser) return { kind: "blocked", message: "The handoff destination is unknown. Select a listed sample adviser first." };
  const previous = lead.response?.handoff;
  if (command.kind === "request") {
    if (previous?.target === adviser.id && previous.status !== "returned") return { kind: "unchanged", message: "This handoff is already requested or accepted. Nothing was changed." };
    const id = previous?.id ?? `handoff:${lead.id}`;
    const task: LeadTask = { id, type: "handoff", status: "open", subject: `Handoff to ${adviser.name}`,
      reason: `${adviser.name} has not accepted this simulated handoff. AI response control is paused.` };
    return { kind: "change", update: {
      owner: adviser.label, status: "Waiting for adviser", nextAction: `Simulate ${adviser.name}'s acceptance`, due: "Awaiting explicit acceptance",
      response: { state: "paused", handoff: { id, target: adviser.id, status: "requested" } },
      tasks: [...(lead.tasks ?? []).filter(item => item.type !== "handoff"), task],
    }, title: `Handoff requested to ${adviser.name}`, detail: `Demo user assigned ${lead.name} to ${adviser.name} and requested a simulated handoff. AI response control is paused; no service or message was changed. Existing meetings are unchanged.` };
  }
  const task = lead.tasks?.find(item => item.id === command.id && item.type === "handoff");
  if (!previous || previous.id !== command.id || previous.target !== adviser.id || !task)
    return { kind: "blocked", message: "This handoff is no longer the current destination. Review the lead again." };
  if (command.kind === "accept") {
    if (previous.status !== "requested" || lead.response?.state !== "paused" || task.status !== "open")
      return { kind: "blocked", message: "Only the current pending handoff can be accepted in this simulation." };
    return { kind: "change", update: {
      ...(lead.status === "Waiting for adviser" ? { status: "In conversation" as const, nextAction: `Review next step with ${adviser.name}`, due: "No next-step deadline recorded" } : {}),
      response: { state: "human", handoff: { ...previous, status: "accepted" } },
      tasks: lead.tasks!.map(item => item.id === task.id ? { ...item, status: "completed" } : item),
    }, title: `Handoff acceptance simulated for ${adviser.name}`, detail: `Demo user simulated acceptance by ${adviser.name}. Human response control is recorded locally; no adviser signed in and no message was sent. Lead owner and meetings are unchanged.` };
  }
  if (previous.status !== "accepted" || lead.response?.state !== "human" || task.status !== "completed")
    return { kind: "blocked", message: "Return to AI requires the current explicitly accepted handoff." };
  return { kind: "change", update: { response: { state: "ai", handoff: { ...previous, status: "returned" } } },
    title: "Response control returned to AI in sample", detail: `Demo user explicitly returned response control from ${adviser.name} to AI in this simulation. Lead owner and meetings are unchanged; no live AI or messaging was activated.` };
}

export function describeResponse(lead: DemoLead) {
  if (lead.status === "Do not contact") return "Blocked by Do not contact · response paused";
  if (!lead.response) return "Paused in sample · previous response control not recorded";
  if (lead.response.state === "human") return `Human · ${findSampleAdviser(lead.response.handoff?.target)?.name ?? "Unknown adviser"} · acceptance simulated`;
  return lead.response.state === "ai" ? "AI · sample control only" : "Paused · no automated response in sample";
}

// Show current control independently of legacy workflow copy. A later callback
// or nurture choice is not overwritten by accepting or returning a handoff.
export function describeNextAction(lead: DemoLead) {
  const context = lead.nextActionContext;
  if (!context || (context.kind === "meeting" && !lead.appointments?.some(meeting => meeting.id === context.meetingId)))
    return `Previous plan · needs review: ${lead.nextAction}`;
  if (context.kind === "meeting" && lead.appointments?.find(meeting => meeting.id === context.meetingId)?.status === "cancelled")
    return "No current action · linked meeting cancelled";
  const handoff = lead.response?.handoff;
  if (lead.status !== "Waiting for adviser" || !handoff) return lead.nextAction;
  const name = findSampleAdviser(handoff.target)?.name ?? "Unknown adviser";
  return handoff.status === "requested" ? `Simulate ${name}'s acceptance`
    : handoff.status === "accepted" ? `Review next step with ${name}` : "Review next step · AI sample control";
}

export function describeNextActionDue(lead: DemoLead) {
  const context = lead.nextActionContext;
  if (!context) return `Previous timing · ${lead.due}`;
  if (context.kind === "meeting") {
    const meeting = lead.appointments?.find(item => item.id === context.meetingId);
    if (!meeting) return `Previous timing · ${lead.due}`;
    if (meeting.status === "cancelled") return "No current action deadline";
  }
  return lead.due;
}
