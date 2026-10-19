import { initialDemoLeads, demoDay, demoQualificationPolicy, demoQualificationDefinition, type DemoLead } from "./demo-leads";
import { sortLeadActivity } from "./lead-activity";
import { readLeadStorage } from "./lead-storage";
import { getLeadTasks } from "./lead-tasks";

// Demo adapter only. Live reporting requires dated events, qualification
// rules and meeting records rather than inference from workflow status.
export function readDemoLeads(saved: string | null): DemoLead[] {
  const result = readLeadStorage(() => ({ getItem: () => saved, setItem() {}, removeItem() {} }), "sample", initialDemoLeads);
  if (result.kind === "ready") return result.leads;
  // Compatibility for reporting callers; the Home UI handles the read error
  // explicitly and never renders this unavailable snapshot as an empty inbox.
  return initialDemoLeads.map(lead => ({
    ...lead, createdAt: undefined, qualification: undefined, appointments: undefined,
    messages: [], timelineItems: [], tasks: undefined, tasksIncomplete: true,
  }));
}

// Fixed Dubai-time reporting window, independent of the viewer's clock.
const inPeriod = (time?: string) => !!time && Date.parse(time) >= Date.parse(demoDay + "T00:00:00+04:00") && Date.parse(time) < Date.parse("2026-09-22T00:00:00+04:00");

export function getHomeSummary(leads: DemoLead[]) {
  const actions = getLeadTasks(leads);
  const tasksKnown = leads.every(lead => lead.tasks !== undefined && !lead.tasksIncomplete);
  const qualified = leads.filter(lead => lead.qualification?.passed && lead.qualification.policy === demoQualificationPolicy && inPeriod(lead.qualification.at));
  const recent = sortLeadActivity(leads.flatMap(lead => lead.timelineItems.map(event => ({ ...event, leadId: lead.id, name: lead.name })))).slice(0, 3);
  const aiQualified = qualified.filter(lead => lead.timelineItems.some(event => event.actor === "AI" && event.title === "Lead qualified" && inPeriod(event.occurredAt))).length;
  const metricValue = (known: boolean, count: number) => known ? String(count) : "—";
  return { actions, tasksKnown, recent, headline: aiQualified
    ? "AI reviewed and qualified " + aiQualified + (aiQualified === 1 ? " lead." : " leads.")
    : "Review the latest lead activity.",
    metrics: [
      { label: "New leads", value: metricValue(leads.every(lead => !!lead.createdAt), leads.filter(lead => inPeriod(lead.createdAt)).length), definition: "Unique leads created during 21 September 2026 in Dubai time.", note: "Created in this period" },
      { label: "Engaged", value: metricValue(leads.every(lead => !!lead.createdAt && lead.messages.every(message => !!message.occurredAt)), leads.filter(lead => lead.messages.some(message => message.from === "lead" && inPeriod(message.occurredAt))).length), definition: "Unique leads with an inbound WhatsApp or voice response in this period. AI replies alone do not count.", note: "With an inbound response" },
      { label: "Qualified", value: metricValue(leads.every(lead => lead.qualification !== undefined), qualified.length), definition: demoQualificationDefinition + " Counts qualifying reviews in this period.", note: "Passed the demo criteria" },
      { label: "Appointments", value: metricValue(leads.every(lead => lead.appointments !== undefined), leads.flatMap(lead => lead.appointments ?? []).filter(meeting => meeting.kind === "meeting" && meeting.status === "confirmed" && inPeriod(meeting.startsAt)).length), definition: "Confirmed meeting records scheduled for 21 September, with a time and owner. Follow-up callbacks are excluded.", note: "Confirmed for 21 Sep" },
    ] };
}
