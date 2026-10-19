import type { DemoLead } from "./demo-leads";
import { restoreLegacyTasks } from "./lead-tasks";
import { findSampleAdviser } from "./lead-handoff";

type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LeadReadResult =
  | { kind: "ready"; source: "missing" | "saved" | "memory"; leads: DemoLead[] }
  | { kind: "unavailable" | "invalid" };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
const optionalDate = (value: unknown) => value === undefined || date(value);
const oneOf = (value: unknown, values: string[]) => text(value) && values.includes(value);
const rows = (value: unknown, valid: (row: Record<string, unknown>) => boolean) => Array.isArray(value) &&
  value.every(row => record(row) && text(row.id) && valid(row)) && new Set(value.map(row => row.id)).size === value.length;

function validResponse(lead: Record<string, unknown>) {
  const tasks = Array.isArray(lead.tasks) ? lead.tasks.filter(task => record(task) && task.type === "handoff") : [];
  const response = lead.response;
  if (response === undefined) return tasks.length === 0; // no invented legacy acceptance
  if (!record(response) || !oneOf(response.state, ["ai", "paused", "human"])) return false;
  const handoff = response.handoff;
  if (handoff === undefined) return response.state !== "human" && tasks.length === 0;
  if (!record(handoff) || !text(handoff.id) || !text(handoff.target) || !oneOf(handoff.status, ["requested", "accepted", "returned"])) return false;
  if (tasks.length !== 1 || tasks[0].id !== handoff.id) return false;
  if (handoff.status === "requested") return response.state === "paused" &&
    (tasks[0].status === "open" || (lead.status === "Do not contact" && tasks[0].status === "blocked"));
  return !!findSampleAdviser(handoff.target) && tasks[0].status === "completed" &&
    (response.state === (handoff.status === "accepted" ? "human" : "ai") || (lead.status === "Do not contact" && response.state === "paused"));
}

function validMeetingReviews(lead: Record<string, unknown>) {
  const meetings = Array.isArray(lead.appointments) ? lead.appointments.filter(record) : [];
  const tasks = Array.isArray(lead.tasks) ? lead.tasks.filter(task => record(task) && task.type === "meeting-review") : [];
  return new Set(tasks.map(task => task.meetingId)).size === tasks.length && tasks.every(task => {
    const meeting = meetings.find(item => item.id === task.meetingId);
    if (!meeting) return false;
    if (task.status === "open") return lead.status === "Do not contact" && meeting.status === "confirmed" && meeting.decision === undefined;
    return task.status === "completed" && (meeting.decision === "keep" || meeting.decision === "cancel");
  });
}

// Validate the current sample shape before making it editable. No migration or
// fallback writes: unknown/corrupt saved data stays intact for recovery.
function validLeads(value: unknown, seeds: DemoLead[]): value is DemoLead[] {
  return rows(value, lead =>
    ["initials", "name", "source", "campaign", "language", "owner", "nextAction", "due", "intent", "budget", "timeline", "interest", "summary", "lastActivity"].every(key => text(lead[key])) &&
    oneOf(lead.status, ["New", "In conversation", "Qualified", "Waiting for adviser", "Callback scheduled", "Nurture", "Do not contact"]) &&
    oneOf(lead.priority, ["High", "Medium", "Low"]) && optionalDate(lead.createdAt) &&
    (lead.tasksIncomplete === undefined || typeof lead.tasksIncomplete === "boolean") &&
    (lead.nextActionContext === undefined || (record(lead.nextActionContext) &&
      (lead.nextActionContext.kind === "independent" ||
        (lead.nextActionContext.kind === "meeting" && text(lead.nextActionContext.meetingId) && !!lead.nextActionContext.meetingId.trim())))) &&
    (lead.tasks === undefined || (Array.isArray(lead.tasks) && rows(lead.tasks, task =>
      oneOf(task.type, ["callback", "price-review", "handoff", "meeting-review"]) &&
      oneOf(task.status, task.type === "meeting-review" ? ["open", "completed"] : task.type === "handoff" ? ["open", "blocked", "completed"] : ["open", "blocked"]) &&
      (task.type === "meeting-review" ? text(task.meetingId) && !!task.meetingId : task.meetingId === undefined) &&
      text(task.subject) && text(task.reason) && optionalDate(task.dueAt)) &&
      lead.tasks.filter((task: { type: string }) => task.type === "callback").length <= 1)) && validResponse(lead) &&
    (lead.qualification === undefined || lead.qualification === null ||
      (record(lead.qualification) && text(lead.qualification.policy) && date(lead.qualification.at) && typeof lead.qualification.passed === "boolean")) &&
    (lead.appointments === undefined || rows(lead.appointments, meeting => meeting.kind === "meeting" && date(meeting.startsAt) &&
      (meeting.owner === undefined || text(meeting.owner)) && oneOf(meeting.status, ["confirmed", "cancelled"]) &&
      (meeting.decision === undefined || (meeting.decision === "keep" && meeting.status === "confirmed") || (meeting.decision === "cancel" && meeting.status === "cancelled")))) &&
    validMeetingReviews(lead) &&
    rows(lead.messages, message => text(message.text) && text(message.time) && optionalDate(message.occurredAt) && oneOf(message.from, ["lead", "agent"]) && oneOf(message.channel, ["WhatsApp", "Voice"])) &&
    rows(lead.timelineItems, event => ["title", "detail"].every(key => text(event[key])) &&
      (event.time === undefined || text(event.time)) && optionalDate(event.recordedAt) &&
      // Legacy activity can lack a parseable scenario time; preserve it as
      // unknown, but still reject malformed field types/new recording times.
      (event.occurredAt === undefined || text(event.occurredAt)) &&
      (event.actor === undefined || oneOf(event.actor, ["AI", "user"])) && oneOf(event.kind, ["message", "call", "decision", "system"]))
  ) && Array.isArray(value) && value.length === seeds.length && seeds.every(seed => value.some(lead => lead.id === seed.id));
}

export function readLeadStorage(access: StorageAccess, key: string | null, seeds: DemoLead[]): LeadReadResult {
  if (!key) return { kind: "ready", source: "memory", leads: seeds };
  let raw: string | null;
  try { raw = access().getItem(key); }
  catch { return { kind: "unavailable" }; }
  if (raw === null) return { kind: "ready", source: "missing", leads: seeds };
  try {
    const parsed: unknown = JSON.parse(raw);
    return validLeads(parsed, seeds) ? { kind: "ready", source: "saved", leads: restoreLegacyTasks(parsed, seeds) } : { kind: "invalid" };
  } catch { return { kind: "invalid" }; }
}

// The caller publishes its next snapshot and success notice only after true.
// A null key remains the existing in-memory development preview, not a save.
export function writeLeadStorage(access: StorageAccess, key: string | null, next: DemoLead[]): boolean {
  if (!key) return true;
  try { access().setItem(key, JSON.stringify(next)); return true; }
  catch { return false; }
}

export function resetLeadStorage(access: StorageAccess, key: string | null): boolean {
  if (!key) return true;
  try { access().removeItem(key); return true; }
  catch { return false; }
}
