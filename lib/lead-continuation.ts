import type { DemoLead } from "./demo-leads";

export type ContinuationNote = {
  id: string;
  kind: "barrier" | "rejection";
  property?: string;
  text: string;
  state: "Reported" | "Needs clarification" | "Resolved";
  evidence: { quote: string; channel: string; time: string; messageId?: string };
  history: { before: string; after: string; previousState: string; state: string; reason: string; at: string }[];
};

export const continuationKey = (scope: string, id: string) => `${scope}:continuation-v1:${id}`;

// Lead storage is owned by lead-storage.ts. Notes are a separate, versioned
// sidecar: never overwrite the Founder's handoff, tasks or response state.
export function resetContinuationStorage(access: () => Pick<Storage, "removeItem">, scope: string | null, leadIds: string[]): boolean {
  if (!scope) return true;
  let complete = true;
  for (const id of leadIds) {
    try { access().removeItem(continuationKey(scope, id)); }
    catch { complete = false; }
  }
  return complete;
}

export function initialContinuation(lead: DemoLead): ContinuationNote[] {
  const message = lead.messages.find(m => m.from === "lead" && m.text === "Not this quarter. Send me something if the payment plan is genuinely good.");
  return message ? [{ id: "purchase-timing", kind: "barrier", text: "Not ready to buy this quarter. Future interest depends on a suitable payment plan.", state: "Reported", evidence: { quote: message.text, channel: message.channel, time: message.time, messageId: message.id }, history: [] }] : [];
}

// Extra fictional review evidence, added only when the reviewer chooses this example.
// It is not inserted into the shared Home fixtures or claimed to be an existing message.
export function rejectionExample(): ContinuationNote {
  return { id: "rejection-example", kind: "rejection", property: "Hills Park · illustrative property", text: "The customer does not want to proceed with this illustrative property's payment schedule.", state: "Reported", evidence: { quote: "I don't want to proceed with Hills Park. The payment schedule doesn't work for me.", channel: "WhatsApp · additional demo scenario", time: "Illustrative message · not a live conversation" }, history: [] };
}

export function correctContinuation(note: ContinuationNote, text: string, state: ContinuationNote["state"], reason: string, at: string): ContinuationNote {
  if (!text.trim() || !reason.trim()) throw new Error("A corrected interpretation and a reason are required.");
  if (!["Reported", "Needs clarification", "Resolved"].includes(state)) throw new Error("Invalid note status.");
  return { ...note, text: text.trim(), state, history: [...note.history, { before: note.text, after: text.trim(), previousState: note.state, state, reason: reason.trim(), at }] };
}

export function parseContinuation(raw: string): ContinuationNote[] {
  const notes: unknown = JSON.parse(raw);
  if (!Array.isArray(notes) || !notes.every(n => n && typeof n.id === "string" && ["barrier", "rejection"].includes(n.kind) && typeof n.text === "string" && ["Reported", "Needs clarification", "Resolved"].includes(n.state) && (n.property === undefined || typeof n.property === "string") && n.evidence && ["quote", "channel", "time"].every(k => typeof n.evidence[k] === "string") && (n.evidence.messageId === undefined || typeof n.evidence.messageId === "string") && Array.isArray(n.history) && n.history.every((h: Record<string, unknown>) => h && ["before", "after", "previousState", "state", "reason", "at"].every(k => typeof h[k] === "string")))) throw new Error("Saved notes could not be read.");
  return notes;
}
