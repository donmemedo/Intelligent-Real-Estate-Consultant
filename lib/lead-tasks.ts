import type { DemoLead, LeadTask } from "./demo-leads";
import { findSampleAdviser } from "./lead-handoff";
import { meetingAnchor } from "./lead-meetings";

// These are the existing fixed scenario choices, not the action recording clock.
export const callbackSlots = {
  "Today · 7:30 PM": "2026-09-21T19:30:00+04:00",
  "Tomorrow · 11:30 AM": "2026-09-22T11:30:00+04:00",
};

export function scheduleCallbackTask(lead: DemoLead, dueAt?: string): LeadTask[] {
  const previous = lead.tasks?.find(task => task.type === "callback");
  const callback: LeadTask = {
    id: previous?.id ?? `callback:${lead.id}`, type: "callback", status: "open",
    subject: previous?.subject ?? "Scheduled callback",
    reason: previous?.reason ?? "Review the conversation and confirm an adviser before placing the callback.",
    dueAt,
  };
  return [...(lead.tasks ?? []).filter(task => task.type !== "callback"), callback];
}

// Read-only compatibility for pre-B4 snapshots, not an ongoing task resolver.
// Old versions could overwrite callback metadata. Never claim the reconstructed
// collection is complete or infer completion from status, nextAction or events.
// Keep known seed issues unresolved; recover only the explicit current legacy
// callback marker. No write, invented due date, event, price result or reset.
export function restoreLegacyTasks(leads: DemoLead[], seeds: DemoLead[]): DemoLead[] {
  return leads.map(lead => {
    if (lead.tasks !== undefined) return lead;
    let tasks = (seeds.find(seed => seed.id === lead.id)?.tasks ?? []).map(task => ({ ...task }));
    if (lead.status === "Callback scheduled") {
      const dueAt = Object.entries(callbackSlots).find(([label]) => label === lead.due)?.[1] ??
        (lead.due === "21 Sep · 7:30 PM" ? callbackSlots["Today · 7:30 PM"] : undefined);
      tasks = scheduleCallbackTask({ ...lead, tasks }, dueAt);
    } else {
      // The seed deadline is not evidence of a legacy callback's current deadline.
      tasks = tasks.map(task => task.type === "callback" ? { ...task, dueAt: undefined } : task);
    }
    if (lead.status === "Do not contact") tasks = tasks.map(task =>
      task.type === "callback" ? { ...task, status: "blocked" } : task);
    return { ...lead, tasks, tasksIncomplete: true };
  });
}

export function getLeadTasks(leads: DemoLead[]) {
  return leads.flatMap(lead => (lead.tasks ?? []).filter(task => task.status !== "completed").map(task => {
    const meeting = task.type === "meeting-review" ? lead.appointments?.find(item => item.id === task.meetingId) : undefined;
    const blocked = (task.type === "callback" || task.type === "handoff") && (task.status === "blocked" || lead.status === "Do not contact");
    return {
      ...task, leadId: lead.id, owner: task.type === "meeting-review" ? meeting?.owner?.trim() || "Unassigned" : task.type === "handoff" ? findSampleAdviser(lead.response?.handoff?.target)?.label ?? "Unassigned · unknown destination" : lead.owner.trim() || "Unassigned",
      title: task.type === "callback" ? `${lead.name} · Callback` : `${lead.name} · ${task.subject}`,
      status: blocked ? "blocked" as const : task.status,
      blocker: blocked ? "Contact blocked. Pending outreach is cancelled; review only." : task.type === "price-review"
        ? "No fresh approved price source or review result is available in this demo." : task.type === "handoff" ? "Explicit simulated acceptance is required; no adviser is signed in." : task.type === "meeting-review" ? "Internal decision only. All contact and automatic reminders remain blocked." : undefined,
      cta: task.type === "callback" ? "Review callback" : task.type === "handoff" ? "Review handoff" : task.type === "meeting-review" ? "Review meeting" : "Review property price",
      review: { lead: lead.id, tab: "overview" as const, q: "", hash: task.type === "meeting-review" && task.meetingId ? "#" + meetingAnchor(task.meetingId) : "#home-review" },
    };
  })).sort((a, b) => {
    const dueA = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const dueB = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    return (dueA === dueB ? 0 : dueA < dueB ? -1 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : a.leadId < b.leadId ? -1 : a.leadId > b.leadId ? 1 : 0);
  });
}

export function describeTaskDue(task: LeadTask) {
  return task.dueAt ? (task.type === "meeting-review" ? "Sample meeting · " : "Sample due · ") + new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(task.dueAt)) + " · Dubai (UTC+4)"
    : task.type === "callback" ? "Callback time unknown · review required" : "No review deadline recorded";
}
