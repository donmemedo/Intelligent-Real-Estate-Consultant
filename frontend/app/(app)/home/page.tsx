"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useMe } from "@/components/shell";
import { Counter, PageHeader, Pill } from "@/components/ui";
import { useApi, type Lead } from "@/lib/api";

export default function Today() {
  const me = useMe();
  const { data: leads, error } = useApi<Lead[]>("/leads?limit=100");
  const all = leads ?? [];
  const waiting = all.filter(l => l.status === "Waiting for adviser");
  const metrics = [
    { label: "Leads", value: all.length, note: "Most recent 100" },
    { label: "Waiting for an adviser", value: waiting.length, note: "AI is paused for these" },
    { label: "With an adviser", value: all.filter(l => l.response_state === "human").length, note: "A person owns the conversation" },
    { label: "Do not contact", value: all.filter(l => l.status === "Do not contact").length, note: "Nothing will be sent" },
  ];
  return (
    <div className="page">
      <PageHeader eyebrow={`Signed in as ${me.name}`} title="Today" />
      {error && <p className="note" role="alert">{error}</p>}
      <section className="card hero-card">
        <span className="spark"><Sparkles size={20} /></span>
        <div className="text">
          <p className="eyebrow">Summary</p>
          <p className="title-2">{!leads ? "Loading…" : waiting.length ? `${waiting.length} ${waiting.length === 1 ? "lead is" : "leads are"} waiting for an adviser.` : "Nothing is waiting for an adviser."}</p>
        </div>
        <Link href="/leads" className="btn btn-primary">Review leads <ArrowUpRight size={16} /></Link>
      </section>
      <section className="grid-4">
        {metrics.map(m => (
          <div key={m.label} className="card metric">
            <span className="metric-label">{m.label}</span>
            <span className="metric-value"><Counter value={String(m.value)} /></span>
            <span className="muted small">{m.note}</span>
          </div>
        ))}
      </section>
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Needs attention <span className="count">{waiting.length}</span></h2>
          <ul className="stack">
            {waiting.map(l => (
              <li key={l.id}>
                <Link href={`/leads?lead=${l.id}`} className="row-link">
                  <span className="tone-dot" data-tone="amber" />
                  <span className="text"><strong>{l.name ?? l.phone}</strong><span className="muted small">Assign or accept the handoff</span></span>
                  <span className="cta">Open</span>
                </Link>
              </li>
            ))}
            {leads && !waiting.length && <li className="muted">All clear. Nothing needs you right now.</li>}
          </ul>
        </section>
        <section className="card">
          <h2 className="card-title">Latest activity</h2>
          <ul className="stack">
            {all.slice(0, 6).map(l => (
              <li key={l.id}>
                <Link href={`/leads?lead=${l.id}`} className="row-link">
                  <span className="tone-dot" data-tone="blue" />
                  <span className="text"><strong>{l.name ?? l.phone}</strong><span className="muted small">{new Date(l.updated_at).toLocaleString()}</span></span>
                  <Pill status={l.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
