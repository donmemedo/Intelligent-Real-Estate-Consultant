import type { DemoLead } from "./demo-leads";

export type LeadTab = "overview" | "conversation" | "activity";
export type LeadLocation = { lead: string; tab: LeadTab; q: string };

// Next 16.2.6 can append a destination hash to a cached canonical hash.
// Only repair our known review anchors; the final anchor is the destination.
export function reviewHash(hash: string) {
  const last = hash.slice(hash.lastIndexOf("#"));
  return hash.indexOf("#", 1) >= 0 && (last === "#home-review" || last.startsWith("#meeting-")) ? last : hash;
}

export function readLeadLocation(search: string, firstLeadId: string) {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const validTab = requestedTab === null || ["overview", "conversation", "activity"].includes(requestedTab);
  return {
    // An absent ID keeps the existing first-lead entry behaviour. Empty or
    // unknown IDs are explicit invalid destinations, not a fallback to Maya.
    lead: params.get("lead") ?? firstLeadId,
    tab: (validTab && requestedTab ? requestedTab : "overview") as LeadTab,
    q: params.get("q") ?? "",
    needsReplace: !params.has("lead") || !validTab,
  };
}

export function leadLocationHref(pathname: string, search: string, location: LeadLocation, hash = "") {
  const params = new URLSearchParams(search);
  params.set("lead", location.lead);
  params.set("tab", location.tab);
  if (location.q) params.set("q", location.q); else params.delete("q");
  // Keep mode, state/preview and any other existing context parameters.
  return `${pathname}?${params.toString()}${reviewHash(hash)}`;
}

export function matchesLeadQuery(lead: DemoLead, query: string) {
  return [lead.name, lead.source, lead.status, lead.interest].join(" ").toLowerCase().includes(query.trim().toLowerCase());
}
