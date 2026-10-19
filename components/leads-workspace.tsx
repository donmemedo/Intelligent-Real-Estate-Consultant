"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Inbox, PlayCircle, RefreshCcw, Settings2 } from "lucide-react";
import { LeadWorkspace } from "@/components/lead-workspace";
import { PrototypeShell } from "@/components/prototype-shell";
import { useSetup } from "@/components/setup-state";
import { initialDemoLeads, demoStorageKey } from "@/lib/demo-leads";
import { getSetupReadiness } from "@/lib/home-state";
import { previewLeadsState, resolveLeadsState, type LeadsState } from "@/lib/leads-state";

const orientations = [
  ["Choose a lead", "Start with the person who needs attention."],
  ["Understand now", "See context, owner and promised next step."],
  ["Take one action", "The status and activity history update together."],
];

export function LeadsWorkspace({ mode, previewState }: { mode?: string; previewState?: string }) {
  const { state: setup } = useSetup();
  const sampleSelected = mode === "sample";
  const preview = previewLeadsState(previewState ?? null, process.env.NODE_ENV === "development");
  const state = preview ?? resolveLeadsState(sampleSelected, 0);
  const readiness = getSetupReadiness(setup);

  const copy: Record<LeadsState, { eyebrow: string; title: string; description: string; badge?: string }> = {
    empty: { eyebrow: "Lead workspace", title: "Your leads will appear here", description: "Connect the essentials, then every real enquiry will arrive with one clear owner and next step." },
    operational: { eyebrow: "Lead workspace", title: "Every lead has one clear next step", description: "Choose a lead, understand what matters and take the next action without searching across tools.", badge: "Development preview · Fictional records" },
    sample: { eyebrow: "Sample lead workspace", title: "Practise the decisions before going live", description: "Use fictional leads to review ownership, follow-up and stop-contact behaviour safely.", badge: "Sample workspace · No customer actions" },
    error: { eyebrow: "Lead workspace", title: "We could not load the lead workspace", description: "No customer action was taken. Retry or continue reviewing setup while the connection is checked.", badge: "Connection needs attention" },
  };
  const content = copy[state];

  return (
    <PrototypeShell eyebrow={content.eyebrow} title={content.title} description={content.description} homeBadge={content.badge} sampleMode={state === "sample"}>
      {(state === "sample" || state === "operational") && <>
        <section className="workspace-orientation">
          {orientations.map(([title, detail], index) => <div key={title}><span>{index + 1}</span><p><strong>{title}</strong><small>{detail}</small></p></div>)}
        </section>
        <LeadWorkspace initialLeads={initialDemoLeads} storageKey={state === "sample" ? demoStorageKey : null} allowReset={state === "sample"} />
      </>}

      {state === "empty" && <EmptyLeads complete={readiness.requiredSetupComplete} next={readiness.next} />}
      {state === "error" && <section className="workspace-state panel state-error">
        <span className="workspace-state-icon"><AlertTriangle size={27} /></span>
        <div><span className="eyebrow">Nothing was changed</span><h2>Lead data is temporarily unavailable</h2><p>We could not read the lead source or CRM connection. The workspace has not sent a message, placed a call or changed ownership.</p></div>
        <div className="workspace-state-actions"><button className="button primary" onClick={() => window.location.reload()} type="button"><RefreshCcw size={16} /> Try again</button><Link className="button secondary" href="/setup">Review setup</Link></div>
      </section>}
    </PrototypeShell>
  );
}

function EmptyLeads({ complete, next }: { complete: boolean; next: string }) {
  return <section className="workspace-state panel">
    <span className="workspace-state-icon"><Inbox size={27} /></span>
    <div>
      <span className="eyebrow">No real leads yet</span>
      <h2>{complete ? "Your lead workspace preview is ready" : "Review setup before the first enquiry arrives"}</h2>
      <p>{complete ? "The prototype has no live lead source, so this is the correct empty state. You can safely explore the fictional workspace while integrations are built." : "Complete the missing setup step so the future intake path has a source, response channel and human owner."}</p>
      <div className="readiness-line"><CheckCircle2 size={16} /><span>{complete ? "Core setup preview complete · no live connection" : "No messages or calls can be sent from this prototype"}</span></div>
    </div>
    <div className="workspace-state-actions">
      <Link className="button primary" href={complete ? "/leads?mode=sample" : `/setup?step=${next}`}>{complete ? <PlayCircle size={16} /> : <Settings2 size={16} />}{complete ? "Explore sample leads" : "Continue setup"}<ArrowRight size={15} /></Link>
      <Link className="button secondary" href={complete ? "/setup" : "/leads?mode=sample"}>{complete ? "Review setup" : "Preview sample leads"}</Link>
    </div>
  </section>;
}
