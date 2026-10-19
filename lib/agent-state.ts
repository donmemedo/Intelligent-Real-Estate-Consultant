import type { SetupSnapshot } from "./home-state";

export type AgentStateTone = "ready" | "setup" | "blocked" | "planned";
export type AgentWorkspaceState = {
  label: "Ready to explore" | "Ready to test" | "Needs setup" | "Live use blocked" | "Planned";
  tone: AgentStateTone;
  reason: string;
  setupStep?: string;
  actionLabel: string;
};

const requirements: Record<string, { ids: string[]; reason: string }> = {
  "lead-agent": { ids: ["source", "crm"], reason: "Choose a lead source and CRM path before testing intake." },
  "whatsapp-agent": { ids: ["whatsapp", "knowledge"], reason: "Prepare WhatsApp and trusted information before testing a reply." },
  "knowledge-agent": { ids: ["knowledge"], reason: "Choose the approved information this role is allowed to use." },
  "recommendation-agent": { ids: ["knowledge"], reason: "Choose trusted property information before testing recommendations." },
  "appointment-agent": { ids: ["routing"], reason: "Choose a lead owner before testing bookings and callbacks." },
  "orchestrator-memory": { ids: ["source", "crm", "whatsapp", "knowledge", "routing", "test"], reason: "Complete the core setup and safe lead check before testing coordination." },
};

function complete(state: SetupSnapshot, id: string) {
  return state.completed.includes(id) && (id === "test" || !!state.values[id]?.trim());
}

export function getAgentWorkspaceState(id: string, state: SetupSnapshot): AgentWorkspaceState {
  if (id === "email-agent") return {
    label: "Planned", tone: "planned", actionLabel: "Review planned scenarios",
    reason: "Email is documented but remains outside the current V0 build path.",
  };
  if (id === "voice-agent") return {
    label: "Live use blocked", tone: "blocked", actionLabel: "Review safe scenarios",
    reason: "The experience can be reviewed, but live UAE calling waits for an approved provider route.",
    setupStep: "voice",
  };
  const requirement = requirements[id];
  if (requirement) {
    const missing = requirement.ids.find(requiredId => !complete(state, requiredId));
    if (missing) return {
      label: "Needs setup", tone: "setup", reason: requirement.reason,
      setupStep: missing, actionLabel: "Continue setup",
    };
    return {
      label: "Ready to test", tone: "ready", actionLabel: "Open workspace",
      reason: "The required prototype setup is complete. Use fictional data to review this role safely.",
    };
  }
  return {
    label: "Ready to explore", tone: "ready", actionLabel: "Open workspace",
    reason: "The role and its main decisions are ready to review with fictional scenarios.",
  };
}
