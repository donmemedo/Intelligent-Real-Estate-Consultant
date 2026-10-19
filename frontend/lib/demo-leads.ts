export type LeadStatus =
  | "New"
  | "In conversation"
  | "Qualified"
  | "Waiting for adviser"
  | "Callback scheduled"
  | "Nurture"
  | "Do not contact";

export type LeadTimelineItem = {
  // Real local recording time. occurredAt remains the fixed scenario time.
  recordedAt?: string;
  occurredAt?: string;
  actor?: "AI" | "user";
  id: string;
  title: string;
  detail: string;
  time?: string;
  kind: "message" | "call" | "decision" | "system";
};

export type LeadMessage = {
  occurredAt?: string;
  id: string;
  from: "lead" | "agent";
  channel: "WhatsApp" | "Voice";
  text: string;
  time: string;
};

export type DemoLead = {
  // Explicit local simulation only. Missing legacy control is not acceptance.
  response?: ResponseControl;
  // The bounded sample work types; not a general task manager.
  tasks?: LeadTask[];
  tasksIncomplete?: boolean;
  createdAt?: string;
  qualification?: { policy: string; at: string; passed: boolean } | null;
  appointments?: DemoMeeting[];
  id: string;
  initials: string;
  name: string;
  source: string;
  campaign: string;
  language: string;
  status: LeadStatus;
  priority: "High" | "Medium" | "Low";
  owner: string;
  nextAction: string;
  // Missing in older snapshots: never infer a meeting link from free text.
  nextActionContext?: { kind: "independent" } | { kind: "meeting"; meetingId: string };
  due: string;
  intent: string;
  budget: string;
  timeline: string;
  interest: string;
  summary: string;
  lastActivity: string;
  messages: LeadMessage[];
  timelineItems: LeadTimelineItem[];
};

export type LeadTask = {
  id: string;
  type: "callback" | "price-review" | "handoff" | "meeting-review";
  status: "open" | "blocked" | "completed";
  subject: string;
  reason: string;
  dueAt?: string;
  meetingId?: string;
};

export type DemoMeeting = {
  id: string;
  kind: "meeting";
  startsAt: string;
  owner?: string;
  status: "confirmed" | "cancelled";
  // Explicit internal sample decision; legacy cancellation is not fabricated.
  decision?: "keep" | "cancel";
};

export type ResponseControl = {
  state: "ai" | "paused" | "human";
  handoff?: { id: string; target: string; status: "requested" | "accepted" | "returned" };
};

const baseDemoLeads: DemoLead[] = [
  {
    id: "maya-khan",
    response: { state: "ai" },
    initials: "MK",
    name: "Maya Khan",
    source: "Meta Ads",
    campaign: "Dubai Hills · Off-plan",
    language: "English",
    status: "Qualified",
    priority: "High",
    owner: "Recommendation Agent",
    nextAction: "Review the illustrative property discussion",
    due: "Ready now",
    intent: "Buy for investment",
    budget: "Up to AED 2.2M",
    timeline: "This year",
    interest: "Dubai Hills · 2 bedroom",
    summary: "Maya wants an off-plan two-bedroom investment. She confirmed her budget and timeline and asked about a 60/40 payment plan.",
    lastActivity: "6 min ago",
    messages: [
      { id: "m1", from: "lead", channel: "WhatsApp", text: "I'm looking for a two-bedroom off-plan property in Dubai Hills.", time: "7:02 PM" },
      { id: "m2", from: "agent", channel: "WhatsApp", text: "Got it. What budget range would feel comfortable?", time: "7:03 PM" },
      { id: "m3", from: "lead", channel: "WhatsApp", text: "Up to AED 2.2M. I'd like to buy this year.", time: "7:04 PM" },
      { id: "m4", from: "agent", channel: "WhatsApp", text: "We can discuss an illustrative property option with an off-plan adviser. Price and availability still need confirmation.", time: "7:05 PM" },
    ],
    timelineItems: [
      { id: "t1", title: "Lead qualified", detail: "Budget, intent, timeline and preferred area captured.", time: "7:05 PM", kind: "decision" },
      { id: "t2", title: "Payment-plan check simulated", detail: "Fictional project-sheet example dated two days before the sample day. No real price or availability was verified.", time: "7:04 PM", kind: "system" },
      { id: "t3", title: "WhatsApp conversation started", detail: "Context from the Meta form was reused.", time: "7:03 PM", kind: "message" },
      { id: "t4", title: "Lead received", detail: "Meta campaign and form answers attached.", time: "7:01 PM", kind: "system" },
    ],
  },
  {
    id: "ahmed-rahman",
    response: { state: "paused" },
    tasks: [{ id: "callback:ahmed-rahman", type: "callback", status: "open", subject: "Scheduled callback", reason: "Compare service charges for two ready apartments.", dueAt: "2026-09-21T19:30:00+04:00" }],
    initials: "AR",
    name: "Ahmed Rahman",
    source: "Property Finder",
    campaign: "Palm Jumeirah · Ready",
    language: "Arabic",
    status: "Callback scheduled",
    priority: "High",
    owner: "Sara · Luxury adviser",
    nextAction: "Call Ahmed with two ready options",
    due: "Today · 7:30 PM",
    intent: "Buy a primary residence",
    budget: "AED 4–5M",
    timeline: "Within 3 months",
    interest: "Palm Jumeirah · 2–3 bedroom",
    summary: "Ahmed is comparing two ready apartments and asked for a call after work. The callback is already assigned to Sara.",
    lastActivity: "18 min ago",
    messages: [
      { id: "m1", from: "lead", channel: "Voice", text: "Please call me after 7:30. I want to compare the service charges.", time: "6:42 PM" },
      { id: "m2", from: "agent", channel: "WhatsApp", text: "Your callback with Sara is confirmed for 7:30 PM today.", time: "6:43 PM" },
    ],
    timelineItems: [
      { id: "t1", title: "Callback confirmed", detail: "Sara accepted the lead and owns the next action.", time: "6:43 PM", kind: "call" },
      { id: "t2", title: "Human requested", detail: "AI qualification stopped immediately.", time: "6:42 PM", kind: "decision" },
      { id: "t3", title: "Lead received", detail: "Property Finder listing context attached.", time: "6:38 PM", kind: "system" },
    ],
  },
  {
    id: "elena-petrova",
    response: { state: "paused" },
    tasks: [{ id: "price-review:elena-petrova:1807", type: "price-review", status: "open", subject: "Marina Vista 18 · Unit 1807", reason: "Price source is 9 days old in the sample scenario; freshness needs review. This does not establish that the price is wrong." }],
    initials: "EP",
    name: "Elena Petrova",
    source: "Bayut",
    campaign: "Marina Vista 18",
    language: "Russian",
    status: "Waiting for adviser",
    priority: "Medium",
    owner: "Sales manager",
    nextAction: "Confirm the latest unit price",
    due: "Needs review",
    intent: "Buy for investment",
    budget: "AED 1.8–2.1M",
    timeline: "This quarter",
    interest: "Dubai Marina · 1 bedroom",
    summary: "Elena asked for the current price of a specific unit. The trusted price source is nine days old, so no figure has been promised.",
    lastActivity: "31 min ago",
    messages: [
      { id: "m1", from: "lead", channel: "WhatsApp", text: "Is unit 1807 still AED 1.95M?", time: "6:20 PM" },
      { id: "m2", from: "agent", channel: "WhatsApp", text: "I'm checking the latest approved price before confirming it.", time: "6:21 PM" },
    ],
    timelineItems: [
      { id: "t1", title: "Price review requested", detail: "The available price source is older than the agency freshness rule.", time: "6:21 PM", kind: "decision" },
      { id: "t2", title: "Unsafe answer blocked", detail: "The old listing price was not sent as current fact.", time: "6:21 PM", kind: "system" },
      { id: "t3", title: "Lead received", detail: "Bayut listing reference attached.", time: "6:17 PM", kind: "system" },
    ],
  },
  {
    id: "daniel-wu",
    response: { state: "paused" },
    initials: "DW",
    name: "Daniel Wu",
    source: "Old CRM lead",
    campaign: "Investor reactivation",
    language: "English",
    status: "Nurture",
    priority: "Low",
    owner: "Nurture journey",
    nextAction: "Review when new launches match his criteria",
    due: "In 30 days",
    intent: "Future investment",
    budget: "AED 1.5M",
    timeline: "6–12 months",
    interest: "Payment-plan opportunities",
    summary: "Daniel is interested but not ready this quarter. He agreed to receive relevant launch updates and should not remain in active sales follow-up.",
    lastActivity: "Yesterday",
    messages: [
      { id: "m1", from: "lead", channel: "Voice", text: "Not this quarter. Send me something if the payment plan is genuinely good.", time: "Yesterday · 4:12 PM" },
    ],
    timelineItems: [
      { id: "t1", title: "Moved to nurture", detail: "Active follow-up stopped; review scheduled in 30 days.", time: "Yesterday · 4:14 PM", kind: "decision" },
      { id: "t2", title: "Interest confirmed", detail: "Future off-plan investment with flexible payment plan.", time: "Yesterday · 4:12 PM", kind: "call" },
    ],
  },
];

export const demoDay = "2026-09-21";
// A new scenario keeps the previous demo's saved choices intact under v1.
export const demoStorageKey = "propagent-demo-leads-v2";
export const demoPeriod = "21 Sep 2026 · 00:00–23:59 · Dubai (UTC+4)";
export const demoQualificationPolicy = "demo-v1";
export const demoQualificationDefinition = "Temporary demo rule: purchase intent, budget, preferred property/area and purchase timeline are captured and explicitly reviewed. This is not the final product policy; adviser handoff alone does not qualify a lead.";

// Explicit dates for the fixed demonstration, never the viewer's system date.
function dated(time?: string) {
  if (!time) return undefined;
  const match = time.match(/(\d{1,2}):(\d{2}) (AM|PM)/);
  if (!match) return undefined;
  const hour = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  return (time.startsWith("Yesterday") ? "2026-09-20" : demoDay) + "T" + String(hour).padStart(2, "0") + ":" + match[2] + ":00+04:00";
}

export const initialDemoLeads: DemoLead[] = baseDemoLeads.map(lead => ({
  ...lead,
  nextActionContext: lead.id === "maya-khan" ? { kind: "meeting", meetingId: "maya-meeting-1" } : { kind: "independent" },
  tasks: lead.tasks ?? [],
  createdAt: lead.id === "daniel-wu" ? "2026-09-20T16:00:00+04:00" : dated(lead.timelineItems.find(event => event.title === "Lead received")!.time),
  qualification: lead.id === "maya-khan" ? { policy: demoQualificationPolicy, at: demoDay + "T19:05:00+04:00", passed: true } : null,
  appointments: lead.id === "maya-khan" ? [{ id: "maya-meeting-1", kind: "meeting", startsAt: demoDay + "T20:00:00+04:00", owner: "Sara · Off-plan adviser", status: "confirmed" }] : [],
  messages: [
    ...lead.messages.map(message => ({ ...message, occurredAt: dated(message.time) })),
    ...(lead.id === "maya-khan" ? [
      { id: "m5", from: "lead" as const, channel: "WhatsApp" as const, text: "Yes, please book the property consultation with Sara at 8 PM.", time: "7:07 PM", occurredAt: demoDay + "T19:07:00+04:00" },
      { id: "m6", from: "agent" as const, channel: "WhatsApp" as const, text: "Your consultation with Sara is confirmed for 21 September at 8 PM Dubai time.", time: "7:08 PM", occurredAt: demoDay + "T19:08:00+04:00" },
    ] : []),
  ],
  timelineItems: [
    ...(lead.id === "maya-khan" ? [{ id: "meeting-confirmed", title: "Property consultation confirmed", detail: "Appointment Agent recorded Maya’s agreement and Sara’s accepted slot: 21 Sep, 8 PM Dubai time.", time: "7:08 PM", occurredAt: demoDay + "T19:08:00+04:00", actor: "AI" as const, kind: "system" as const }] : []),
    ...lead.timelineItems.map(event => ({
      ...event, occurredAt: dated(event.time),
      ...(lead.id === "maya-khan" && event.title === "Lead qualified" ? { actor: "AI" as const, detail: "WhatsApp Agent reviewed purchase intent, budget, area and timeline under the temporary demo-v1 rule." } : {}),
    })),
  ],
  ...(lead.id === "maya-khan" ? { owner: "Sara · Off-plan adviser", nextAction: "Attend the confirmed property consultation", due: "21 Sep · 8:00 PM", lastActivity: "7:08 PM", summary: lead.summary + " At 7:08 PM on 21 September, her 8 PM consultation with Sara was confirmed. See the meeting record for its current status." } : {}),
  ...(lead.id === "ahmed-rahman" ? { due: "21 Sep · 7:30 PM" } : {}),
}));
