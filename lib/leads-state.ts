export type LeadsState = "empty" | "operational" | "sample" | "error";

export function resolveLeadsState(sampleSelected: boolean, realLeadCount: number, loadFailed = false): LeadsState {
  if (sampleSelected) return "sample";
  if (loadFailed) return "error";
  return realLeadCount > 0 ? "operational" : "empty";
}

export function previewLeadsState(value: string | null, development: boolean): LeadsState | null {
  if (!development) return null;
  return value === "empty" || value === "operational" || value === "sample" || value === "error" ? value : null;
}
