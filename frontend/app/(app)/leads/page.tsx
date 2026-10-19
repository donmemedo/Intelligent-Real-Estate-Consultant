"use client";

import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, Search, Send, Undo2, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type FormEvent } from "react";
import { useMe } from "@/components/shell";
import { Avatar, PageHeader, Pill, Sheet } from "@/components/ui";
import { api, newKey, SUPERVISORS, useApi, type ActionResult, type Lead, type LeadDetail, type User } from "@/lib/api";

const RESPONSE = { ai: "AI replies", paused: "AI paused", human: "An adviser owns this" } as const;
const WIDE = "(min-width: 1024px)"; // matches the CSS breakpoint that swaps the side pane for a sheet
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function useWide() {
  return useSyncExternalStore(
    notify => { const q = matchMedia(WIDE); q.addEventListener("change", notify); return () => q.removeEventListener("change", notify); },
    () => matchMedia(WIDE).matches,
    () => true,
  );
}

function Detail({ id, users, onChange }: { id: string; users: User[]; onChange: () => void }) {
  const me = useMe();
  const { data: lead, error, reload } = useApi<LeadDetail>(`/leads/${id}`, 5_000);
  const [notice, setNotice] = useState<{ text: string; alert?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [draft, setDraft] = useState("");
  const [key, setKey] = useState(newKey); // one key per draft: a retried send is never sent twice
  if (error) return <p className="note" role="alert">{error}</p>;
  if (!lead) return <p className="muted" role="status">Loading…</p>;

  const stopped = lead.status === "Do not contact";
  const handoff = lead.open_handoff;
  const nameOf = (userId: string | null) => users.find(u => u.id === userId)?.name ?? "Unknown";
  const canSpeak = handoff?.status === "accepted" && (handoff.target_user_id === me.id || SUPERVISORS.includes(me.role));

  async function act(path: string, json?: unknown, headers?: HeadersInit): Promise<boolean> {
    setBusy(true);
    try {
      const result = await api<ActionResult | { status: string }>(path, { method: "POST", json, headers });
      setNotice({ text: "message" in result ? result.message : "Message queued for WhatsApp." });
      await reload();
      onChange();
      return true;
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), alert: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handOff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await act(`/leads/${id}/handoffs`, { target_user_id: new FormData(e.currentTarget).get("target") });
  }

  async function stop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await act(`/leads/${id}/stop`, { reason: new FormData(e.currentTarget).get("reason") })) setStopping(false);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (await act(`/leads/${id}/messages`, { body: draft }, { "Idempotency-Key": key })) {
      setDraft("");
      setKey(newKey());
    }
  }

  return (
    <article className="detail">
      <header className="detail-head">
        <Avatar name={lead.name ?? lead.phone} big />
        <div className="text"><h2 className="title-2">{lead.name ?? lead.phone}</h2><span className="muted">{lead.phone}</span></div>
        <Pill status={lead.status} />
      </header>
      <div className="inset">
        <p className="eyebrow">{RESPONSE[lead.response_state]}</p>
        <p className="title-3">
          {handoff?.status === "requested" ? `Waiting for ${nameOf(handoff.target_user_id)} to accept`
            : handoff ? `${nameOf(handoff.target_user_id)} is handling this conversation`
              : lead.owner_user_id ? `Owner: ${nameOf(lead.owner_user_id)}` : "No adviser assigned"}
        </p>
        {lead.last_inbound_at && <p className="muted small">Last customer message {when(lead.last_inbound_at)}</p>}
      </div>
      {notice && <p className={notice.alert ? "note" : "muted"} role={notice.alert ? "alert" : "status"}>{notice.text}</p>}

      {!stopped && (
        <div className="actions">
          {handoff?.status === "requested" && handoff.target_user_id === me.id && (
            <button className="btn btn-primary" disabled={busy} onClick={() => act(`/handoffs/${handoff.id}/accept`)}><Check size={16} /> Accept handoff</button>
          )}
          {canSpeak && (
            <button className="btn" disabled={busy} onClick={() => act(`/handoffs/${handoff!.id}/return`)}><Undo2 size={16} /> Return to AI</button>
          )}
          {me.role !== "operator" && (
            <form className="row wrap" onSubmit={handOff}>
              <label className="field inline">{handoff ? "Reassign to" : "Hand off to"}
                <select name="target" required defaultValue="">
                  <option value="" disabled>Choose a person</option>
                  {users.filter(u => u.role !== "operator").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <button className="btn" disabled={busy}><UserPlus size={16} /> {handoff ? "Reassign" : "Hand off"}</button>
            </form>
          )}
        </div>
      )}

      <section>
        <h3 className="card-title">Conversation</h3>
        <div className="chat">
          {lead.conversation.map((m, i) => (
            <div key={i} className="bubble" data-from={m.direction === "in" ? "lead" : "agent"}>
              {m.body}<span>{when(m.at)}{m.status ? ` · ${m.status}` : ""}</span>
            </div>
          ))}
          {!lead.conversation.length && <p className="muted small">No messages yet.</p>}
        </div>
      </section>

      {canSpeak && !stopped && (
        <form className="composer" onSubmit={send}>
          <label className="sr-only" htmlFor={`reply-${id}`}>Reply on WhatsApp</label>
          <textarea id={`reply-${id}`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4096} rows={3} required placeholder="Write a WhatsApp reply" />
          <button className="btn btn-primary" disabled={busy || !draft.trim()}><Send size={16} /> Send</button>
        </form>
      )}

      {stopped ? <button className="btn btn-danger" disabled><Ban size={16} /> Contact stopped</button>
        : stopping ? (
          // Do-not-contact cannot be undone in the product, so it always takes a second, explicit step.
          <form className="inset danger-confirm" onSubmit={stop}>
            <label className="field">Why is contact being stopped?
              <input name="reason" required maxLength={500} defaultValue="Customer asked not to be contacted." />
            </label>
            <div className="row wrap">
              <button className="btn btn-danger" disabled={busy}><Ban size={16} /> Confirm stop</button>
              <button type="button" className="btn" onClick={() => setStopping(false)}>Keep active</button>
            </div>
          </form>
        ) : <button className="btn btn-danger" onClick={() => setStopping(true)}><Ban size={16} /> Stop contact</button>}
    </article>
  );
}

function Leads() {
  const router = useRouter();
  const selected = useSearchParams().get("lead");
  const wide = useWide();
  const { data: leads, error, reload } = useApi<Lead[]>("/leads?limit=100");
  const { data: users = [] } = useApi<User[]>("/users", 60_000);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const select = (id: string | null) => router.replace(id ? `/leads?lead=${id}` : "/leads", { scroll: false });

  const all = leads ?? [];
  const filters = ["All", ...new Set(all.map(l => l.status))];
  const q = query.trim().toLowerCase();
  const shown = all.filter(l => (filter === "All" || l.status === filter) && `${l.name ?? ""} ${l.phone}`.toLowerCase().includes(q));
  const current = selected ?? (wide ? shown[0]?.id : undefined) ?? null;

  return (
    <div className="page">
      <PageHeader eyebrow={leads ? `${all.length} leads` : "Loading"} title="Leads" />
      {error && <p className="note" role="alert">{error}</p>}
      <div className="toolbar">
        <label className="search glass">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search leads" />
        </label>
        <div className="segmented" role="group" aria-label="Filter by status">
          {filters.map(f => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {filter === f && <motion.span layoutId="filter-pill" className="seg-pill" />}{f}
            </button>
          ))}
        </div>
      </div>
      <div className="split">
        <ul className="card lead-list">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map(l => (
              <motion.li key={l.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                <button className="lead-row" aria-current={l.id === current ? "true" : undefined} onClick={() => select(l.id)}>
                  {l.id === current && <motion.span layoutId="lead-selection" className="lead-sel" />}
                  <Avatar name={l.name ?? l.phone} />
                  <span className="text"><strong>{l.name ?? l.phone}</strong><span className="muted small ellipsis">{RESPONSE[l.response_state]}</span></span>
                  <Pill status={l.status} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {leads && !shown.length && <li className="empty muted">{all.length ? "No leads match this view." : "No leads yet. They appear here when customers message your WhatsApp number."}</li>}
        </ul>
        {wide && <div className="detail-pane card">{current && <Detail key={current} id={current} users={users} onChange={reload} />}</div>}
      </div>
      {!wide && (
        <Sheet open={!!current} onClose={() => select(null)} label="Lead">
          {current && <Detail key={current} id={current} users={users} onChange={reload} />}
        </Sheet>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return <Suspense><Leads /></Suspense>;
}
