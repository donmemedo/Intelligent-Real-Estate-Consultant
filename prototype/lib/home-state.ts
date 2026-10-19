import { setupSteps } from "./prototype-data";
import { type DemoLead } from "./demo-leads";

export type HomeState = "onboarding" | "ready" | "operational" | "sample";
export type StepStatus = "Complete" | "In progress" | "Not started" | "Needs attention";
export type SetupSnapshot = { selected: number; completed: string[]; values: Record<string, string> };
export type WorkspaceReadiness = {
  realLeadCount: number;
  requiredSetupComplete: boolean;
  checks: { label: string; ready: boolean }[];
};

// Only this function chooses the actual workspace state. Preview never changes its inputs.
export function resolveHomeState(sampleSelected: boolean, workspace: WorkspaceReadiness): HomeState {
  if (sampleSelected) return "sample";
  if (workspace.realLeadCount > 0) return "operational";
  return workspace.requiredSetupComplete ? "ready" : "onboarding";
}

export function previewHomeState(value: string | null): HomeState | null {
  return value === "onboarding" || value === "ready" || value === "operational" || value === "sample" ? value : null;
}

const concepts = [
  { title: "Agency profile", ids: ["agency"], description: "Start with your agency name. Market, language and hours are preview context." },
  { title: "Lead handling rules", ids: ["knowledge", "test"], description: "Review approved information, demo qualification and the safe lead check." },
  { title: "Human handoff", ids: ["routing"], description: "Choose the adviser who receives the lead." },
  { title: "Lead source and channel", ids: ["source", "crm", "whatsapp"], description: "Choose a source, record destination and response channel." },
];

export function getSetupReadiness(state: SetupSnapshot) {
  const required = setupSteps.filter(step => !step.optional);
  const complete = (id: string) => state.completed.includes(id) && (id === "test" || !!state.values[id]?.trim());
  const next = required.find(step => !complete(step.id))?.id ?? "agency";
  const groups = concepts.map(group => {
    const incomplete = group.ids.filter(id => !complete(id));
    const attention = incomplete.find(id => state.completed.includes(id));
    const started = group.ids.some(id => complete(id)) || (state.completed.length > 0 && group.ids.includes(setupSteps[state.selected]?.id));
    const status: StepStatus = !incomplete.length ? "Complete" : attention ? "Needs attention" : started ? "In progress" : "Not started";
    return { ...group, status, target: attention ?? incomplete[0] ?? group.ids[0] };
  });
  const requiredSetupComplete = required.every(step => complete(step.id));
  return { groups, next, count: required.filter(step => complete(step.id)).length, total: required.length, requiredSetupComplete,
    checks: [
      { label: "Lead source", ready: complete("source") && complete("crm") },
      { label: "Response channel", ready: complete("whatsapp") },
      { label: "AI instructions", ready: complete("knowledge") && complete("test") },
      { label: "Human handoff", ready: complete("routing") },
    ],
  };
}

// Prototype adapter: no backend exists and no real leads are injected.
// Replace with tenant-scoped real lead counts and verified go-live checks.
export function getPrototypeWorkspace(state: SetupSnapshot): WorkspaceReadiness & { realLeads: DemoLead[] } {
  const realLeads: DemoLead[] = [];
  return { realLeadCount: realLeads.length, realLeads, ...getSetupReadiness(state) };
}
