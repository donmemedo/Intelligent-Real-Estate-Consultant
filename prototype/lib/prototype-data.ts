export type SetupStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  outcome: string;
  optional?: boolean;
};

export type JourneyDefinition = {
  id: string;
  name: string;
  role: string;
  promise: string;
  accent: "blue" | "teal" | "amber" | "violet";
  flows: string[];
};

export type JourneyStage = {
  id: string;
  label: string;
  actor: string;
  title: string;
  description: string;
  outcome: string;
  nextOwner: string;
  sharedContext: string[];
};

export const setupSteps: SetupStep[] = [
  {
    id: "agency",
    number: 1,
    title: "Tell us about your agency",
    description: "Start with the name your team recognises. The sample workspace uses Dubai residential sales.",
    outcome: "PropAgent knows who it represents and who can take the next action.",
  },
  {
    id: "source",
    number: 2,
    title: "Choose a lead source",
    description: "Choose where new enquiries arrive from, such as Meta, Bayut or Property Finder.",
    outcome: "New enquiries enter one clear lead journey with their source attached.",
  },
  {
    id: "crm",
    number: 3,
    title: "Choose your CRM path",
    description: "Connect the agency CRM or use a safe demo connection for this prototype.",
    outcome: "Lead ownership and the next action have one visible home.",
  },
  {
    id: "whatsapp",
    number: 4,
    title: "Prepare WhatsApp",
    description: "Give your agency's WhatsApp connection a recognisable label. Account connection is previewed here.",
    outcome: "PropAgent can continue a permitted conversation in the agency's channel.",
  },
  {
    id: "knowledge",
    number: 5,
    title: "Choose trusted information",
    description: "Choose a sample knowledge source to see where property answers will come from.",
    outcome: "Agents answer with agency-approved information and show uncertainty honestly.",
  },
  {
    id: "routing",
    number: 6,
    title: "Choose a lead owner",
    description: "Choose who should receive the example lead. This preview uses Dubai time and English-language enquiries.",
    outcome: "Every handoff has an eligible owner and a clear next step.",
  },
  {
    id: "voice",
    number: 7,
    title: "Prepare voice",
    description: "Review the voice experience while the permitted telecom route is being confirmed.",
    outcome: "The team understands the flow without pretending production calling is live.",
    optional: true,
  },
  {
    id: "test",
    number: 8,
    title: "Run a safe lead test",
    description: "Send a fictional lead through the full journey before contacting anyone real.",
    outcome: "The agency can see the conversation, decision, owner and final next action.",
  },
];

export const journeys: JourneyDefinition[] = [
  {
    id: "lead-journey",
    name: "Lead journey",
    role: "The shared path",
    promise: "Moves every enquiry from arrival to one clear, owned next step.",
    accent: "blue",
    flows: ["New inbound lead", "Returning lead", "Human requested", "Stop or nurture"],
  },
  {
    id: "lead-agent",
    name: "Lead Agent",
    role: "The organiser",
    promise: "Checks the source, avoids duplicates and prepares the right context.",
    accent: "teal",
    flows: ["Receive", "Validate", "Merge safely", "Choose next action"],
  },
  {
    id: "whatsapp-agent",
    name: "WhatsApp Agent",
    role: "The conversation specialist",
    promise: "Replies, qualifies and follows up without repeating what the lead already said.",
    accent: "teal",
    flows: ["First reply", "Continue qualification", "Answer a property question", "Stop or hand over"],
  },
  {
    id: "voice-agent",
    name: "Voice Agent",
    role: "The call specialist",
    promise: "Handles permitted calls and keeps the next action clear after every outcome.",
    accent: "violet",
    flows: ["Warm inbound call", "Return call", "Callback request", "Disconnect or handover"],
  },
  {
    id: "knowledge-agent",
    name: "Knowledge Agent",
    role: "The trusted answer desk",
    promise: "Finds an approved answer or explains when a human needs to confirm it.",
    accent: "amber",
    flows: ["Find a verified fact", "Resolve conflicting sources", "Handle missing data", "Request review"],
  },
  {
    id: "recommendation-agent",
    name: "Property Recommendation Agent",
    role: "The matchmaker",
    promise: "Turns the lead's needs into a short, explainable property shortlist.",
    accent: "blue",
    flows: ["Capture preferences", "Find matches", "Explain ranking", "No safe match"],
  },
  {
    id: "appointment-agent",
    name: "Appointment Agent",
    role: "The scheduler",
    promise: "Turns an agreed time into a real callback, meeting or viewing with an owner.",
    accent: "violet",
    flows: ["Offer times", "Confirm booking", "Reschedule or cancel", "Recover a failed booking"],
  },
  {
    id: "manager-agent",
    name: "Manager & Sales Coach",
    role: "The team lead",
    promise: "Shows what moved, what stalled and where a manager should step in.",
    accent: "amber",
    flows: ["Morning brief", "Stalled lead alert", "Team performance", "Coaching review"],
  },
  {
    id: "email-agent",
    name: "Email Agent",
    role: "The nurture specialist",
    promise: "Keeps the approved email journey visible without expanding the current V0.",
    accent: "blue",
    flows: ["Connect mailbox", "Send permitted follow-up", "Read reply", "Stop or nurture"],
  },
  {
    id: "orchestrator-memory",
    name: "Orchestrator & Shared Memory",
    role: "The coordinator",
    promise: "Keeps every agent on the same customer story and selects the next permitted action.",
    accent: "violet",
    flows: ["Read current context", "Choose eligible action", "Assign one owner", "Record the result"],
  },
];

export const goldenPath: JourneyStage[] = [
  {
    id: "arrive",
    label: "01",
    actor: "Lead Agent",
    title: "A new enquiry arrives",
    description: "Maya submitted a Meta form for a two-bedroom off-plan property in Dubai.",
    outcome: "Source, campaign and contact details are kept together.",
    nextOwner: "Lead Agent",
    sharedContext: ["Meta campaign", "Dubai Hills interest", "English", "Contact details"],
  },
  {
    id: "prepare",
    label: "02",
    actor: "Lead Agent",
    title: "The lead is prepared",
    description: "The number is valid, the lead is not duplicated and contact is permitted in this demo.",
    outcome: "One lead record is ready for a first response.",
    nextOwner: "WhatsApp Agent",
    sharedContext: ["Eligible contact", "No duplicate", "Inbound enquiry", "Ad context retained"],
  },
  {
    id: "engage",
    label: "03",
    actor: "WhatsApp Agent",
    title: "The conversation begins",
    description: "PropAgent acknowledges the enquiry and asks one useful question at a time.",
    outcome: "Maya confirms her budget, preferred area and purchase timeline.",
    nextOwner: "Knowledge Agent",
    sharedContext: ["Budget: AED 2.2M", "Timeline: this year", "Dubai Hills", "Payment-plan question"],
  },
  {
    id: "answer",
    label: "04",
    actor: "Knowledge Agent",
    title: "A property question is checked",
    description: "A fictional dated sheet illustrates a payment-plan check.",
    outcome: "Source checking is simulated; real price and availability remain unverified.",
    nextOwner: "Recommendation Agent",
    sharedContext: ["Payment-plan check simulated", "Fictional dated source", "Availability unverified", "Qualification retained"],
  },
  {
    id: "recommend",
    label: "05",
    actor: "Recommendation Agent",
    title: "One illustrative property is discussed",
    description: "Hills Park is a story example, not a ranked or verified shortlist.",
    outcome: "Maya can discuss the example with an adviser; price and availability still need evidence.",
    nextOwner: "Appointment Agent",
    sharedContext: ["One illustrative property", "Hills Park discussion", "No ranked shortlist", "Price and availability unverified"],
  },
  {
    id: "handoff",
    label: "06",
    actor: "Appointment Agent",
    title: "A human conversation is arranged",
    description: "In this story, Maya agrees to an 8 PM consultation with Sara. The summary and open property questions stay attached.",
    outcome: "A fictional consultation is recorded; no real invitation or handoff is sent.",
    nextOwner: "Sara · Off-plan adviser",
    sharedContext: ["Conversation summary", "Qualification", "Hills Park example", "Consultation: 21 Sep · 8 PM Dubai"],
  },
  {
    id: "observe",
    label: "07",
    actor: "Manager & Sales Coach",
    title: "The result becomes visible",
    description: "The manager sees a qualified lead, the assigned adviser and the promised next step.",
    outcome: "This story ends with a pending next step, not completed customer follow-up.",
    nextOwner: "Sara · Off-plan adviser",
    sharedContext: ["Qualified in sample", "Consultation agreed in story", "Next step still pending", "No live handoff or message"],
  },
];
