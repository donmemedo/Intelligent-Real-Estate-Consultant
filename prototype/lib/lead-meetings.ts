import type { DemoLead, LeadTask } from "./demo-leads";

export type MeetingCommand = { kind: "keep-meeting" | "cancel-meeting"; meetingId: string };
type MeetingPlan = { kind: "change"; update: Partial<DemoLead>; title: string; detail: string } |
  { kind: "blocked" | "unchanged"; message: string };

export const meetingAnchor = (id: string) => "meeting-" + encodeURIComponent(id);

// Called only by an explicit Stop submission, never by reading or rendering.
export function planStopContact(lead: DemoLead): MeetingPlan {
  if (lead.status === "Do not contact") return { kind: "unchanged", message: "Contact is already blocked. Nothing was changed." };
  const tasks: LeadTask[] = (lead.tasks ?? []).map(task =>
    (task.type === "callback" || task.type === "handoff") && task.status !== "completed"
      ? { ...task, status: "blocked" } : task);
  for (const meeting of lead.appointments ?? []) {
    if (meeting.status !== "confirmed" || tasks.some(task => task.type === "meeting-review" && task.meetingId === meeting.id)) continue;
    tasks.push({ id: `meeting-review:${lead.id}:${meeting.id}`, type: "meeting-review", meetingId: meeting.id,
      status: "open", subject: "Meeting decision", dueAt: meeting.startsAt,
      reason: "Contact is blocked. This confirmed meeting needs a separate internal decision to keep or cancel it." });
  }
  return { kind: "change", update: {
    status: "Do not contact", response: { ...lead.response, state: "paused" }, tasks,
    nextAction: "No outreach · review any pending meeting decision", due: "Contact block effective immediately",
  }, title: "Contact stopped", detail: `Demo user added ${lead.name} to the sample suppression list. AI replies, follow-ups and automatic reminders are blocked; manual contact is not authorized. Existing meetings remain unchanged for a separate internal decision. No message was sent or live service changed.` };
}

export function planMeetingDecision(lead: DemoLead, command: MeetingCommand): MeetingPlan {
  const meeting = lead.appointments?.find(item => item.id === command.meetingId);
  if (!meeting) return { kind: "blocked", message: "This meeting is unavailable for this lead. Review the destination again." };
  if (meeting.status === "cancelled") return { kind: "unchanged", message: "This meeting is already cancelled. Nothing was changed." };
  const review = lead.tasks?.find(task => task.type === "meeting-review" && task.meetingId === meeting.id);
  const keeping = command.kind === "keep-meeting";
  if (keeping) {
    if (lead.status !== "Do not contact") return { kind: "blocked", message: "Keeping is an internal decision for a contact-blocked meeting only." };
    if (meeting.decision === "keep") return { kind: "unchanged", message: "The decision to keep this meeting is already recorded. Contact remains blocked." };
    if (!review || review.status !== "open") return { kind: "blocked", message: "No pending review is recorded for this meeting." };
  }
  const decision = keeping ? "keep" as const : "cancel" as const;
  return { kind: "change", update: {
    appointments: lead.appointments!.map(item => item.id === meeting.id ? {
      ...item, status: keeping ? "confirmed" as const : "cancelled" as const, decision,
    } : item),
    tasks: lead.tasks?.map(task => task.id === review?.id ? { ...task, status: "completed" as const } : task),
  }, title: keeping ? "Meeting kept in sample" : "Meeting cancelled in sample",
    detail: `Demo user recorded an internal decision to ${decision} meeting ${meeting.id} for ${lead.name}. ${lead.status === "Do not contact" ? "Contact, AI replies, follow-ups and automatic reminders remain blocked; keeping a meeting does not authorize manual contact." : "Contact policy and response control are unchanged."} No notification was sent and no external calendar was changed.` };
}
