"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoLead } from "@/lib/demo-leads";
import { continuationKey, correctContinuation, initialContinuation, parseContinuation, rejectionExample, type ContinuationNote } from "@/lib/lead-continuation";

export function LeadContinuation({ lead, scope, showMessage, canEdit, isCurrentDestination }: {
  lead: DemoLead; scope: string | null; showMessage: (id: string) => void;
  canEdit: boolean; isCurrentDestination: () => boolean;
}) {
  const [notes, setNotes] = useState(() => initialContinuation(lead));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ContinuationNote["state"]>("Reported");
  const key = scope ? continuationKey(scope, lead.id) : null;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => {
      try {
        const saved = key ? localStorage.getItem(key) : null;
        if (saved !== null) setNotes(parseContinuation(saved));
      } catch { setError("Saved review notes could not be loaded. They have not been overwritten. Reset fictional leads to start again."); }
      setReady(true);
    }, 0);
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [key]);

  function save(next: ContinuationNote[], message: string) {
    if (!mounted.current || !ready || error || !canEdit || !isCurrentDestination()) return;
    try { if (key) localStorage.setItem(key, JSON.stringify(next)); }
    catch { setNotice("Could not save in this browser. Nothing changed. Try again when browser storage is available."); return; }
    setNotes(next);
    setEditing(null);
    setNotice(message);
  }

  return <section className="continuation-panel" aria-label="Conversation handover notes" data-ready={ready}>
    <span className="eyebrow">For the next conversation</span>
    <h3>What matters before following up</h3>
    <p className="continuation-help">Customer-stated barriers and rejected options, with the words behind them. Missing notes never delay a human handoff.</p>
    {!canEdit && <p role="status">Review notes are read-only while another action is open, the selection is changing or this lead is outside the search results.</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready ? <p>Loading review notes…</p> : error ? <p role="alert">{error}</p> : <>
      {!notes.some(n => n.kind === "barrier") && <p className="continuation-empty">No purchase barrier recorded. Do not infer one from budget or silence.</p>}
      {!notes.some(n => n.kind === "rejection") && <p className="continuation-empty">No rejected property recorded.</p>}
      {notes.map(note => <article className="continuation-note" key={note.id}>
        <header><strong>{note.kind === "barrier" ? "Customer-stated barrier" : "Rejected option"}</strong><span>{note.state}</span></header>
        {note.property && <h4>{note.property}</h4>}
        <p>{note.text}</p>
        {note.history.length > 0 && <small>Adviser interpretation updated. The original customer quote is unchanged.</small>}
        <details className="continuation-evidence"><summary>View evidence</summary>
          <blockquote>{note.evidence.quote}</blockquote>
          <small>{note.evidence.channel} · {note.evidence.time}</small>
          {note.evidence.messageId && <button type="button" onClick={() => showMessage(note.evidence.messageId!)}>Open original message</button>}
        </details>
        {note.history.length > 0 && <details><summary>Correction history ({note.history.length})</summary>
          <ol>{note.history.map((change, i) => <li key={i}>
            <strong>Demo adviser · {new Date(change.at).toLocaleString()}</strong>
            <p>Before: {change.before} ({change.previousState})</p><p>After: {change.after} ({change.state})</p><p>Reason: {change.reason}</p>
          </li>)}</ol>
        </details>}
        {editing === note.id ? <form onSubmit={event => {
          event.preventDefault();
          save(notes.map(n => n.id === note.id ? correctContinuation(n, text, state, reason, new Date().toISOString()) : n), scope ? "Correction saved in this browser. Customer evidence and previous versions are preserved." : "Correction applied to this temporary preview. It will reset when you leave this view.");
        }}>
          <label>Interpretation<textarea required maxLength={600} value={text} onChange={e => setText(e.target.value)} /></label>
          <label>Status<select value={state} onChange={e => setState(e.target.value as ContinuationNote["state"])}><option>Reported</option><option>Needs clarification</option><option>Resolved</option></select></label>
          <label>Reason for correction<input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <p>Changing this note does not change contact permission, lead status, ownership or the next action.</p>
          <div className="continuation-actions"><button type="submit" disabled={!canEdit || !text.trim() || !reason.trim()}>Save correction</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : <button type="button" disabled={!canEdit} onClick={() => { if (!isCurrentDestination()) return; setEditing(note.id); setText(note.text); setState(note.state); setReason(""); setNotice(""); }}>Correct interpretation</button>}
      </article>)}
      {lead.id === "maya-khan" && !notes.some(n => n.id === "rejection-example") && <div className="continuation-example">
        <p>Optional review example: record why the customer rejected Hills Park, the same illustrative property used in the story. This does not add a second property or change the conversation, Home or follow-up action.</p>
        <button type="button" disabled={!canEdit} onClick={() => save([...notes, rejectionExample()], "Fictional rejection example added to these review notes only.")}>Try a fictional rejection</button>
      </div>}
    </>}
    <p className="continuation-footnote">Fictional review only · {scope ? "Saved separately in this browser" : "Temporary preview"} · No CRM writes or customer actions</p>
  </section>;
}
