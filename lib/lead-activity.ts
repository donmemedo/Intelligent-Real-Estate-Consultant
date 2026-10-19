import type { LeadTimelineItem } from "./demo-leads";

export function createLeadActivity(title: string, detail: string): LeadTimelineItem {
  return {
    id: `event-${crypto.randomUUID()}`,
    recordedAt: new Date().toISOString(),
    actor: "user", title, detail, kind: "decision",
  };
}

function timestamp(event: LeadTimelineItem) {
  const value = Date.parse(event.recordedAt ?? event.occurredAt ?? "");
  return Number.isFinite(value) ? value : null;
}

// Unknown times follow dated events. IDs break ties, independent of lead/array
// order. Never invent a date for legacy records or mutate the saved array.
export function sortLeadActivity<T extends LeadTimelineItem & { leadId?: string }>(events: readonly T[]): T[] {
  const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...events].sort((a, b) => {
    const at = timestamp(a), bt = timestamp(b);
    if (at !== bt) return at === null ? 1 : bt === null ? -1 : bt - at;
    return compareId(a.leadId ?? "", b.leadId ?? "") || compareId(a.id, b.id);
  });
}

function relativeTime(at: number, now: number) {
  const seconds = Math.floor((now - at) / 1000);
  if (seconds < 0) return "Ahead of this device’s clock";
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function describeLeadActivity(event: LeadTimelineItem, now: number | null = null) {
  const at = timestamp(event);
  const actor = event.actor === "user" ? "Demo user" : event.actor === "AI" ? "AI · sample scenario" : "Actor not recorded";
  if (at === null) return { text: "Time unknown", shortText: "Time unknown", dateTime: undefined, actor };
  const date = new Date(at);
  const absolute = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "medium",
  }).format(date);
  const relative = event.recordedAt && now !== null ? relativeTime(at, now) : null;
  return {
    text: `${event.recordedAt ? "Recorded" : "Sample scenario"} · ${absolute} · Dubai (UTC+4)${relative ? ` · ${relative}` : ""}`,
    shortText: relative ?? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date),
    dateTime: date.toISOString(), actor,
  };
}
