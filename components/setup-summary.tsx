"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSetup } from "@/components/setup-state";
import { setupSteps } from "@/lib/prototype-data";

export function SetupSummary({ compact = false }: { compact?: boolean }) {
  const { state, ready, sample } = useSetup();
  const steps = setupSteps.filter(step => !step.optional);
  const count = steps.filter(step => state.completed.includes(step.id)).length;
  const next = steps.find(step => !state.completed.includes(step.id));
  return <section className="panel setup-summary">
    <span className="eyebrow">{compact ? "Setup" : "Your setup preview"}</span>
    <div className="setup-score"><strong>{ready ? count : "—"}</strong><span>of 7 required steps complete</span></div>
    <div className="progress-track"><span style={{ width: `${count / 7 * 100}%` }} /></div>
    <h3>{next ? `Next: ${next.title}` : "Ready to explore leads"}</h3>
    {!compact && <p>Voice is optional. Your choices stay saved in this browser.</p>}
    <Link className="text-link" href={(next ? "/setup" : "/leads") + (sample ? "?mode=sample" : "")}>{next ? "Continue setup" : "Open leads"}<ArrowRight size={15} /></Link>
  </section>;
}
