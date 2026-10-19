"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3 } from "lucide-react";
import { type DemoLead } from "@/lib/demo-leads";
import { getHomeSummary } from "@/lib/home-summary";
import { describeLeadActivity } from "@/lib/lead-activity";
import { describeTaskDue } from "@/lib/lead-tasks";
import { leadLocationHref } from "@/lib/lead-location";
import type { LeadReadResult } from "@/lib/lead-storage";

export function OperationalHome({ leads, sampleData = false, navigationSearch = "", loadState = "ready", onRetry }: {
  leads: DemoLead[]; sampleData?: boolean; navigationSearch?: string;
  loadState?: LeadReadResult["kind"] | "loading"; onRetry?: () => void;
}) {
  const [activityNow, setActivityNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setActivityNow(Date.now());
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);
  if (loadState === "loading") return <p role="status">Loading saved sample attention and activity…</p>;
  if (loadState !== "ready") return <section className="panel workspace-state state-error" role="alert">
    <div><h2>Sample attention is unavailable</h2><p>{loadState === "invalid" ? "Saved sample data could not be validated." : "Browser storage could not be read."} The number of open tasks is unknown. Existing data was not replaced or deleted.</p></div>
    {onRetry && <button type="button" className="button secondary" onClick={onRetry}>Retry loading sample Home</button>}
  </section>;
  const { metrics, actions, tasksKnown, recent, headline } = getHomeSummary(leads);
  const params = new URLSearchParams(navigationSearch);
  if (sampleData) params.set("mode", "sample");
  const leadHref = (lead: string, tab: "overview" | "activity" = "overview", hash = "#home-review") =>
    leadLocationHref("/leads", params.toString(), { lead, tab, q: params.get("q") ?? "" }, hash);
  return <>
    <section className="value-banner">
      <div><h2>{headline}</h2><p>{actions.length} {tasksKnown ? "" : "known "}{actions.length === 1 ? "item needs" : "items need"} your attention.</p></div>
      <Link className="text-link home-view-leads" href={sampleData ? "/leads?mode=sample" : "/leads"}>View leads <ArrowRight size={15} /></Link>
    </section>
    <section className="panel action-panel home-attention" aria-labelledby="attention-title">
      <div className="section-heading"><div><span className="eyebrow">What needs you</span><h2 id="attention-title">Actions needing attention</h2></div><span className="count-badge" aria-label={actions.length + " items needing attention"}>{actions.length}</span></div>
      {!tasksKnown && <p className="home-context" role="status">Older sample: task information is incomplete. This is the count of known unresolved items, not an all-clear. Previous task outcomes or deadlines may be unknown.</p>}
      <div className="action-list">{actions.map(item => <article key={item.id}>
        <span className="action-icon amber">{item.type === "callback" ? <Clock3 size={18} /> : <CircleAlert size={18} />}</span>
        <div><strong>{item.title}</strong><p>{item.reason}</p><p>Task: {item.status} · Owner: {item.owner}</p>
          <p>{describeTaskDue(item)}</p>{item.blocker && <p>{item.blocker}</p>}</div>
        <Link href={leadHref(item.review.lead, item.review.tab, item.review.hash)}>{item.cta}</Link>
      </article>)}</div>
      {!actions.length && tasksKnown && <p>No callback, price-review, handoff or meeting-review items need attention.</p>}
    </section>
    <section aria-label="Sample day metrics">
      {metrics.some(metric => metric.value === "—") && <p className="home-context" role="status">Some reporting data is unavailable. Open a definition for details.</p>}
      <div className="metric-grid">{metrics.map(metric => <article className="metric-card" key={metric.label}>
        <span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.note}</p>
        <details><summary>{metric.label} definition</summary><p>{metric.definition}</p><p>— means data is unavailable, not zero. These separate measures are not a conversion funnel.</p></details>
      </article>)}</div>
    </section>
    <div className="home-grid">
      <section className="panel recent-results">
        <div className="section-heading"><h2>Recent activity</h2></div>
        <p className="home-context">Local sample activity · recording dates are separate from the 21 Sep KPI day. Unknown times appear last.</p>
        <div className="result-list">{recent.map(event => {
          const activity = describeLeadActivity(event, activityNow);
          return <article key={event.leadId + event.id}><div>
          <strong>{event.name}: {event.title}</strong>
          <span>{activity.actor}</span>
          <span><time dateTime={activity.dateTime}>{activity.text}</time></span>
          <Link className="text-link" href={leadHref(event.leadId, "activity")}>View details <ArrowRight size={13} /></Link>
        </div></article>; })}</div>
      </section>
    </div>
  </>;
}
