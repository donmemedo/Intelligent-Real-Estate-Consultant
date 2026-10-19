import Link from "next/link";
import { ArrowRight, ShieldCheck, UserCheck, Waypoints } from "lucide-react";
import { LiveChat } from "@/components/live-chat";
import { Brand } from "@/components/shell";
import { Counter, Reveal, ThemeToggle } from "@/components/ui";
import { initialDemoLeads } from "@/lib/demo-leads";
import { getHomeSummary } from "@/lib/home-summary";
import { journeys } from "@/lib/prototype-data";

const principles = [
  { Icon: UserCheck, title: "One owner, every step", text: "Each result names who acts next: an AI role, an adviser or a manager. Nothing waits in limbo." },
  { Icon: ShieldCheck, title: "Safe by default", text: "Exceptions stop, escalate or schedule work. A lead is never silently dropped or contacted against their wishes." },
  { Icon: Waypoints, title: "Context travels", text: "Budget, timeline and preferences move with the lead, so no customer is asked the same question twice." },
];

export default function Landing() {
  const { metrics } = getHomeSummary(initialDemoLeads);
  return (
    <div className="landing">
      <header className="landing-bar glass">
        <Brand />
        <nav className="row"><ThemeToggle /><Link href="/home" className="btn btn-sm btn-primary">Open workspace</Link></nav>
      </header>

      <section className="hero">
        <Reveal className="hero-copy">
          <p className="badge"><span className="pulse" /> Sample workspace · Dubai</p>
          <h1 className="display">Every lead.<br /><span className="gradient-text">One clear next step.</span></h1>
          <p className="lede">IREC&apos;s AI team answers, qualifies and hands off every property enquiry. AI drafts, policy decides, a person approves.</p>
          <div className="row wrap">
            <Link href="/home" className="btn btn-primary btn-lg">Open today <ArrowRight size={18} /></Link>
            <Link href="/journey" className="btn btn-lg">Watch the journey</Link>
          </div>
        </Reveal>
        <LiveChat />
      </section>

      <Reveal className="grid-4">
        {metrics.map(m => (
          <div key={m.label} className="card metric" title={m.definition}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value"><Counter value={m.value} /></span>
            <span className="muted small">{m.note}</span>
          </div>
        ))}
      </Reveal>

      <section className="grid-3">
        {principles.map(({ Icon, title, text }, n) => (
          <Reveal key={title} delay={n * 0.08} className="card principle">
            <span className="spark"><Icon size={20} /></span>
            <h2 className="title-3">{title}</h2>
            <p className="muted">{text}</p>
          </Reveal>
        ))}
      </section>

      <Reveal className="team-strip">
        <h2 className="title-1">Ten roles. <span className="muted">One shared memory.</span></h2>
        <ul className="chips">{journeys.map(j => <li key={j.id} className="chip" data-accent={j.accent}>{j.name}</li>)}</ul>
        <Link href="/team" className="btn">Meet the AI team <ArrowRight size={16} /></Link>
      </Reveal>

      <footer className="foot muted small">Prototype with fictional data. No live calls, messages or CRM writes.</footer>
    </div>
  );
}
