"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MessageSquareText,
  Phone,
  RefreshCcw,
  Search,
  ShieldOff,
  Sprout,
  UserRoundCheck,
} from "lucide-react";
import { type DemoLead, type LeadStatus, demoQualificationDefinition } from "@/lib/demo-leads";
import { LeadContinuation } from "@/components/lead-continuation";
import { resetContinuationStorage } from "@/lib/lead-continuation";
import { readLeadStorage, resetLeadStorage, writeLeadStorage, type LeadReadResult } from "@/lib/lead-storage";
import { createLeadActivity, describeLeadActivity, sortLeadActivity } from "@/lib/lead-activity";
import { leadLocationHref, matchesLeadQuery, readLeadLocation, reviewHash, type LeadLocation } from "@/lib/lead-location";
import { callbackSlots, describeTaskDue, getLeadTasks, scheduleCallbackTask } from "@/lib/lead-tasks";
import { describeNextAction, describeNextActionDue, describeResponse, findSampleAdviser, planHandoff, sampleAdvisers, type HandoffCommand } from "@/lib/lead-handoff";
import { meetingAnchor, planMeetingDecision, planStopContact, type MeetingCommand } from "@/lib/lead-meetings";

type Action = "assign" | "callback" | "nurture" | "stop" | "accept" | "return" | "meeting";
type ActionSession = { kind: Action; leadId: string; context: string; meetingId?: string; canKeep?: boolean };
type ActionCommand = HandoffCommand | MeetingCommand | { kind: "stop" };
type PendingAction = { leadId: string; update: Partial<DemoLead>; title: string; detail: string; command?: ActionCommand };
const isMeetingCommand = (command?: ActionCommand): command is MeetingCommand => command?.kind === "keep-meeting" || command?.kind === "cancel-meeting";
const browserStorage = () => window.localStorage;

export function LeadWorkspace({ initialLeads, storageKey, allowReset = false }: { initialLeads: DemoLead[]; storageKey: string | null; allowReset?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = `${useSearchParams()}`;
  const location = readLeadLocation(search, initialLeads[0].id);
  const selectedId = `${location.lead}`;
  const tab = location.tab;
  const [isNavigating, startNavigation] = useTransition();
  const [navigationTarget, setNavigationTarget] = useState<LeadLocation>(location);
  // Keep fast typing responsive while the App Router commits its replacement.
  // Once settled (including Back/Forward), the URL is the only source of truth.
  const query = isNavigating ? navigationTarget.q : location.q;
  const changingDestination = isNavigating && (navigationTarget.lead !== selectedId || navigationTarget.tab !== tab);
  const [leads, setLeads] = useState<DemoLead[]>(initialLeads);
  const [action, setAction] = useState<ActionSession | null>(null);
  const [notice, setNotice] = useState("");
  const [readState, setReadState] = useState<LeadReadResult["kind"] | "loading">("loading");
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [settled, setSettled] = useState(false);
  const [activityNow, setActivityNow] = useState<number | null>(null);
  const submitted = useRef(false);
  const actionSession = useRef<ActionSession | null>(null);
  const navigating = useRef(false);
  const detailRef = useRef<HTMLElement>(null);
  const [notesReset, setNotesReset] = useState(0);
  const [evidenceMessage, setEvidenceMessage] = useState<{ lead: string; message: string } | null>(null);

  useEffect(() => {
    if (readState === "ready" && !isNavigating && tab === "conversation" && evidenceMessage?.lead === selectedId) {
      const target = document.getElementById(`lead-message-${selectedId}-${evidenceMessage.message}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }
  }, [tab, evidenceMessage, selectedId, readState, isNavigating]);
  const scrolledReview = useRef("");

  useEffect(() => {
    const tick = () => setActivityNow(Date.now());
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const result = readLeadStorage(browserStorage, storageKey, initialLeads);
      if (result.kind === "ready") setLeads(result.leads);
      setReadState(result.kind);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialLeads, storageKey]);

  const filtered = leads.filter(item => matchesLeadQuery(item, query));
  const lead = leads.find((item) => item.id === selectedId);
  const outsideResults = !!lead && !filtered.some(item => item.id === lead.id);
  const context = `${JSON.stringify([pathname, search, storageKey, outsideResults])}`;
  const [actionContext, setActionContext] = useState(context);
  useEffect(() => {
    let frame = 0;
    const repairReviewAnchor = () => {
      const hash = reviewHash(window.location.hash);
      // Hash-only replacement uses Next's supported native-history integration:
      // keep the current entry, query and router state; never push a new visit.
      if (hash !== window.location.hash)
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + hash);
      // On direct loads the saved meeting may mount after the router's scroll.
      // Wait for valid data/layout; typing q must not repeatedly move the view.
      const scrollKey = JSON.stringify([selectedId, tab, hash]);
      if (readState !== "ready" || scrolledReview.current === scrollKey ||
        !(hash === "#home-review" || hash.startsWith("#meeting-"))) return;
      scrolledReview.current = scrollKey;
      let id = hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Invalid escapes must not crash navigation. */ }
      frame = window.requestAnimationFrame(() =>
        (document.getElementById(hash.slice(1)) ?? document.getElementById(id))?.scrollIntoView({ block: "start" }));
    };
    repairReviewAnchor();
    window.addEventListener("popstate", repairReviewAnchor);
    window.addEventListener("hashchange", repairReviewAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", repairReviewAnchor);
      window.removeEventListener("hashchange", repairReviewAnchor);
    };
  }, [pathname, search, readState, tab, selectedId]);
  // Discard drafts before children render a different destination. Returning
  // with Back must not revive a cancelled form or a failed action's Retry.
  if (actionContext !== context) {
    setActionContext(context);
    setAction(null);
    setPendingAction(null);
    setActionNotice("");
    setError("");
    setSettled(false);
  }
  const destinationPending = isNavigating || location.needsReplace;
  const canMutate = readState === "ready" && !!lead && !outsideResults && !destinationPending;

  useEffect(() => { actionSession.current = null; }, [context]);
  useEffect(() => {
    if (!isNavigating && !location.needsReplace) navigating.current = false;
  }, [isNavigating, search, location.needsReplace]);
  useEffect(() => {
    if (readState !== "ready" || !location.needsReplace) return;
    navigating.current = true;
    router.replace(leadLocationHref(pathname, search, readLeadLocation(search, initialLeads[0].id), window.location.hash), { scroll: false });
  }, [router, pathname, search, readState, location.needsReplace, initialLeads]);

  const currentDestination = useCallback(() => {
    // Also guard the interval between a browser history change and React's next
    // render, and any retained handler from a now-unmounted action panel.
    return !navigating.current && window.location.pathname === pathname &&
      new URLSearchParams(window.location.search).toString() === search;
  }, [pathname, search]);

  function navigate(patch: Partial<LeadLocation>, method: "push" | "replace") {
    closeAction();
    setNotice("");
    const next = { ...(isNavigating ? navigationTarget : { lead: selectedId, tab, q: query }), ...patch };
    const href = leadLocationHref(pathname, window.location.search, next, window.location.hash);
    if (!isNavigating && href === pathname + window.location.search + window.location.hash) return;
    navigating.current = true;
    setNavigationTarget(next);
    startNavigation(() => router[method](href, { scroll: false }));
  }

  function selectLead(id: string) {
    setEvidenceMessage(null);
    navigate({ lead: id, tab: "overview" }, "push");
    if (window.matchMedia("(max-width: 760px)").matches) {
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }

  function clearActionFeedback() {
    submitted.current = false;
    setSettled(false);
    setPendingAction(null);
    setActionNotice("");
    setError("");
  }

  function openAction(next: Action, meetingId?: string) {
    if (!canMutate || !lead || (lead.status === "Do not contact" && next !== "meeting") || action || !currentDestination()) return;
    const meeting = lead.appointments?.find(item => item.id === meetingId);
    if (next === "meeting" && (!meeting || meeting.status !== "confirmed")) return;
    clearActionFeedback();
    setNotice("");
    const session = { kind: next, leadId: lead.id, context, meetingId,
      canKeep: next === "meeting" && lead.status === "Do not contact" && lead.tasks?.some(task => task.type === "meeting-review" && task.meetingId === meetingId && task.status === "open") };
    actionSession.current = session;
    setAction(session);
  }

  function closeAction() {
    actionSession.current = null;
    setAction(null);
    clearActionFeedback();
  }

  function retryRead() {
    const result = readLeadStorage(browserStorage, storageKey, initialLeads);
    if (result.kind === "ready") setLeads(result.leads);
    setReadState(result.kind);
  }

  const updateLead = useCallback((session: ActionSession, update: Partial<DemoLead>, eventTitle: string, eventDetail: string, command?: ActionCommand) => {
    const target = leads.find(item => item.id === selectedId);
    if (!canMutate || !target || !currentDestination() || actionSession.current !== session ||
      session.leadId !== target.id || session.context !== context || submitted.current ||
      (target.status === "Do not contact" && !isMeetingCommand(command))) return;
    if (session.kind === "meeting" && (!isMeetingCommand(command) || session.meetingId !== command.meetingId)) return;
    if (session.kind === "stop" && command?.kind !== "stop") return;
    let changes = update;
    if (command) {
      if (session.kind !== (isMeetingCommand(command) ? "meeting" : command.kind === "request" ? "assign" : command.kind)) return;
      const plan = isMeetingCommand(command) ? planMeetingDecision(target, command) : command.kind === "stop" ? planStopContact(target) : planHandoff(target, command);
      if (plan.kind !== "change") {
        if (plan.kind === "blocked") setError(plan.message);
        else { submitted.current = true; setSettled(true); setActionNotice(plan.message); }
        return;
      }
      changes = plan.update; eventTitle = plan.title; eventDetail = plan.detail;
    }
    submitted.current = true;
    const event = createLeadActivity(eventTitle, eventDetail);
    const next = leads.map((item) => item.id === target.id ? {
      ...item,
      ...changes,
      // These explicit non-meeting actions replace the plan. Review/read never
      // invents provenance; a meeting decision retains the existing link.
      ...(changes.nextAction !== undefined ? { nextActionContext: changes.nextActionContext ?? { kind: "independent" as const } } : {}),
      lastActivity: event.recordedAt!,
      timelineItems: [
        event,
        ...item.timelineItems,
      ],
    } : item);
    if (!writeLeadStorage(browserStorage, storageKey, next)) {
      submitted.current = false;
      setPendingAction({ leadId: target.id, update, title: eventTitle, detail: eventDetail, command });
      setError("Could not save this action. Nothing was changed. Your choice is kept below; retry when storage is available.");
      return;
    }
    setLeads(next);
    setActivityNow(Date.now());
    setPendingAction(null);
    setError("");
    setActionNotice(eventDetail);
    // Keep the same panel/controls mounted until explicitly closed. Disabling
    // these targets prevents a second mouse click or tap hitting another action.
    setSettled(true);
  }, [canMutate, selectedId, currentDestination, context, leads, storageKey]);

  function resetWorkspace() {
    if (!canMutate || !currentDestination()) return;
    setNotice("");
    if (!resetLeadStorage(browserStorage, storageKey)) {
      setError("Could not reset fictional leads. Nothing was changed. Try reset again when storage is available.");
      return;
    }
    const notesCleared = resetContinuationStorage(browserStorage, storageKey, initialLeads.map(item => item.id));
    setNotesReset(n => n + 1);
    setEvidenceMessage(null);
    setLeads(initialLeads);
    navigate({ lead: initialLeads[0].id, tab: "overview", q: "" }, "replace");
    setNotice(notesCleared ? "Demo leads and review notes were restored to their original state." : "Demo leads were reset, but some separately saved review notes could not be cleared. Retry Reset fictional leads when storage is available.");
  }

  if (readState === "loading") return <p role="status">Loading saved sample leads…</p>;
  if (readState !== "ready") return <section className="workspace-state panel state-error" role="alert">
    <CircleAlert size={24} />
    <div><h2>{readState === "invalid" ? "Saved sample data could not be validated" : "Saved sample data is unavailable"}</h2>
      <p>{readState === "invalid" ? "The existing data was not replaced or deleted. Recover valid sample data before making changes." : "Browser storage could not be read. No changes are allowed until it can be read safely."}</p></div>
    <button className="button secondary" onClick={retryRead} type="button">Retry loading sample leads</button>
  </section>;

  const activeActionPanel = action && lead && canMutate && action.context === context && action.leadId === lead.id && <div>
    <ActionPanel session={action} cancel={closeAction} lead={lead} onUpdate={updateLead} settled={settled} />
    {actionNotice && <p role="status"><CheckCircle2 size={17} /> {actionNotice}</p>}
    {error && <p role="alert"><CircleAlert size={17} /> {error}</p>}
    {pendingAction && pendingAction.leadId === lead.id && <div><p>Unsubmitted choice: {pendingAction.detail}</p><button className="button secondary" type="button" onClick={() => updateLead(action, pendingAction.update, pendingAction.title, pendingAction.detail, pendingAction.command)}>Retry saving action</button></div>}
  </div>;

  return (
    <div className="lead-workspace" onClickCapture={event => {
      // Native buttons keep keyboard activation (detail=0). Suppress the second
      // click of a mouse multi-click even when it targets a different element.
      if (event.detail > 1) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <aside className="lead-inbox panel">
        <div className="inbox-heading">
          <div><span className="eyebrow">Lead inbox</span><h2>Choose a lead</h2></div>
          <span>{leads.length}</span>
        </div>
        <label className="lead-search">
          <Search size={15} />
          <input aria-label="Search leads" disabled={changingDestination || location.needsReplace} onChange={(event) => navigate({ q: event.target.value }, "replace")} placeholder="Search name, source or status" value={query} />
        </label>
        {query && <button className="reset-demo" type="button" onClick={() => navigate({ q: "" }, "replace")}>Clear search</button>}
        <div className="lead-list">
          {filtered.map((item) => (
            <button className={item.id === selectedId ? "selected" : ""} disabled={destinationPending} key={item.id} onClick={() => selectLead(item.id)} type="button">
              <span className="lead-list-avatar">{item.initials}</span>
              <span className="lead-list-copy">
                <span><strong>{item.name}</strong><small>{item.timelineItems.length ? describeLeadActivity(sortLeadActivity(item.timelineItems)[0], activityNow).shortText : "Time unknown"}</small></span>
                <small>{item.source} · {item.interest}</small>
                <span className="lead-list-foot"><StatusPill status={item.status} /><small>{describeNextAction(item)}</small></span>
              </span>
            </button>
          ))}
          {!filtered.length && <div className="empty-leads">No leads match this search.</div>}
        </div>
        {allowReset && <button className="reset-demo" disabled={!canMutate} onClick={resetWorkspace} type="button"><RefreshCcw size={14} /> Reset fictional leads</button>}
      </aside>

      {!lead ? <section className="lead-detail panel workspace-state" role="alert">
        <CircleAlert size={24} /><div><h2>Lead not found</h2><p>The lead in this link is unavailable in this workspace. No other lead has been selected.</p>
          <button className="button secondary" type="button" onClick={() => navigate({ lead: initialLeads[0].id, tab: "overview", q: "" }, "push")}>Back to lead list</button>
        </div>
      </section> : <section className="lead-detail panel" ref={detailRef} id="home-review">
        {destinationPending && <p className="home-context" role="status">Updating selection… Actions are temporarily unavailable.</p>}
        {outsideResults && <p className="home-review-context" role="status">This lead is outside the search results. Details are read-only. Clear search to enable available actions.</p>}
        <header className="lead-detail-header">
          <div className="lead-identity">
            <span className="large-avatar">{lead.initials}</span>
            <div>
              <div className="identity-title"><h2>{lead.name}</h2><StatusPill status={lead.status} /></div>
              <p>{lead.source} · {lead.campaign} · {lead.language}</p>
            </div>
          </div>
          <span className={`priority-badge ${lead.priority.toLowerCase()}`}>{lead.priority} priority</span>
        </header>

        <div className="now-strip">
          <div><span>Lead owner</span><strong><UserRoundCheck size={15} /> {lead.owner || "Unassigned"}</strong></div>
          <div><span>Next action</span><strong>{describeNextAction(lead)}</strong></div>
          <div><span>When</span><strong><Clock3 size={15} /> {describeNextActionDue(lead)}</strong></div>
        </div>

        <section className="home-review-context" aria-label="Sample responsibilities">
          <span className="eyebrow">Responsibilities · local simulation</span>
          <p>Lead owner: {lead.owner || "Unassigned"} · responsible for progressing this lead.</p>
          <p>Response control: <strong>{describeResponse(lead)}</strong></p>
          <p>Handoff: {lead.response?.handoff ? `${lead.response.handoff.status === "requested" ? "Awaiting acceptance" : lead.response.handoff.status === "accepted" ? "Accepted in simulation" : "Explicitly returned to AI"} · ${findSampleAdviser(lead.response.handoff.target)?.name ?? "Unknown destination"}` : "No explicit handoff recorded"}.</p>
          <p>No authentication, live AI, messages or real permission checks. Demo user records the simulation, not a signed-in adviser.</p>
        </section>

        {lead.tasksIncomplete && <p className="home-context" role="status">Older sample: some task state could not be recovered. Known issues remain unresolved; missing details are not completion.</p>}
        {getLeadTasks([lead]).map(task => <section className="home-review-context" key={task.id}>
          <span className="eyebrow">Review context · fictional data</span>
          <h3>{task.type === "callback" ? "Callback review" : task.type === "handoff" ? "Handoff review" : task.type === "meeting-review" ? "Meeting review" : "Property price review"} · {task.subject}</h3>
          <p>{task.reason}</p><p>Task: {task.status} · Owner: {task.owner}</p>
          <p>{describeTaskDue(task)}</p>{task.blocker && <p>{task.blocker}</p>}
          <p>{task.type === "callback" ? "Check the historical conversation and current lead owner before the next step." : task.type === "handoff" ? "Use the explicit simulation in the action panel. Reviewing is not acceptance." : task.type === "meeting-review" ? `Review meeting ${task.meetingId} below. Keeping or cancelling it requires a separate internal confirmation.` : "A fresh approved price source and a recorded review result are needed. Price approval and availability verification are not implemented here."}</p>
          <p>Opening this review does not complete work, approve a price or take ownership.</p>
        </section>)}
        {notice && <div className="workspace-notice" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} type="button">Dismiss</button></div>}
        {error && !action && <div className="workspace-notice" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}

        <nav className="lead-tabs" aria-label="Lead details">
          <button className={tab === "overview" ? "active" : ""} disabled={destinationPending} onClick={() => navigate({ tab: "overview" }, "push")} type="button">Overview</button>
          <button className={tab === "conversation" ? "active" : ""} disabled={destinationPending} onClick={() => navigate({ tab: "conversation" }, "push")} type="button">Conversation <span>{lead.messages.length}</span></button>
          <button className={tab === "activity" ? "active" : ""} disabled={destinationPending} onClick={() => navigate({ tab: "activity" }, "push")} type="button">Activity <span>{lead.timelineItems.length}</span></button>
        </nav>

        {tab === "overview" && <>
              {lead.appointments?.map(meeting => <section className="home-review-context" key={meeting.id} id={meetingAnchor(meeting.id)} aria-label={`Meeting ${meeting.id}`}>
                <strong>Property consultation · {meeting.status}</strong>
                <p>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }).format(new Date(meeting.startsAt))} · Dubai (UTC+4)</p>
                <p>Meeting owner: {meeting.owner?.trim() || "Unassigned"}</p>
                <p>Meeting ID: {meeting.id}. Changing the lead owner or follow-up plan does not change this meeting.</p>
                {lead.status === "Do not contact" && <p><strong>Contact blocked.</strong> AI replies, follow-ups and automatic reminders remain blocked. Keeping this meeting does not authorize manual contact.</p>}
                {meeting.decision && <p>Internal sample decision: {meeting.decision === "keep" ? "Keep meeting" : "Cancel meeting"} · recorded by Demo user. No notification sent.</p>}
                {meeting.status === "confirmed" && <button className="button secondary" type="button" disabled={!!action || !canMutate} onClick={() => openAction("meeting", meeting.id)}>{lead.status === "Do not contact" && meeting.decision !== "keep" ? "Review meeting decision" : "Review cancellation"}</button>}
                {action?.kind === "meeting" && action.meetingId === meeting.id && activeActionPanel}
              </section>)}
          <div className="lead-overview">
            <section className="lead-summary-card">
              <span className="eyebrow">Original sample context · historical</span>
              <p>{lead.summary}</p>
              <p className="home-context">Names and plans in this original story are historical. Current responsibility and task records above take precedence.</p>
              {lead.qualification && <details><summary>Qualification criteria</summary><p>{demoQualificationDefinition}</p><p>Review: {lead.qualification.passed ? "Passed" : "Not passed"} · {lead.qualification.policy}</p></details>}
              <div className="qualification-grid">
                <Fact label="Intent" value={lead.intent} />
                <Fact label="Budget" value={lead.budget} />
                <Fact label="Timeline" value={lead.timeline} />
                <Fact label="Property interest" value={lead.interest} />
              </div>
            </section>

            <section className="next-action-card">
              <span className="eyebrow">Your available actions</span>
              <h3>{lead.status === "Do not contact" ? "Contact is stopped" : "Manage the next step"}</h3>
              <p>{lead.status === "Do not contact" ? "Contact, AI replies, follow-ups and automatic reminders remain blocked; manual contact is not authorized. Internal meeting decisions remain available in each meeting record. This is not the temporary AI pause used during handoff." : "Assign a lead owner and request handoff, arrange a callback or change follow-up. Callback and follow-up changes preserve lead owner, response control and existing meetings."}</p>
              {lead.status !== "Do not contact" && <div className="lead-actions">
                <button className="primary-action" disabled={!!action || !canMutate} onClick={() => openAction("assign")} type="button"><UserRoundCheck size={17} /> Assign adviser</button>
                {lead.response?.handoff?.status === "requested" && <button disabled={!!action || !canMutate || !findSampleAdviser(lead.response.handoff.target)} onClick={() => openAction("accept")} type="button">Review simulated acceptance</button>}
                {lead.response?.handoff?.status === "accepted" && <button disabled={!!action || !canMutate} onClick={() => openAction("return")} type="button">Review return to AI</button>}
                <button disabled={!!action || !canMutate} onClick={() => openAction("callback")} type="button"><CalendarClock size={17} /> Schedule callback</button>
                <button disabled={!!action || !canMutate} onClick={() => openAction("nurture")} type="button"><Sprout size={17} /> Follow up later</button>
                <button className="danger-action" disabled={!!action || !canMutate} onClick={() => openAction("stop")} type="button"><ShieldOff size={17} /> Stop contact</button>
              </div>}
              {action?.kind !== "meeting" && activeActionPanel}
            </section>
            <LeadContinuation key={`${context}-${notesReset}`} lead={lead} scope={storageKey}
              canEdit={canMutate && !action} isCurrentDestination={currentDestination}
              showMessage={id => {
                if (destinationPending || !currentDestination()) return;
                setEvidenceMessage({ lead: lead.id, message: id });
                navigate({ tab: "conversation" }, "push");
              }} />
          </div>
        </>}

        {tab === "conversation" && (
          <section className="conversation-view">
            <div className="tab-intro"><div><span className="eyebrow">Historical sample conversation</span><h3>WhatsApp and voice context together</h3></div><span>Not current response control</span></div>
            <div className="message-thread">
              {lead.messages.map((message) => (
                <article id={`lead-message-${lead.id}-${message.id}`} tabIndex={-1} className={`${message.from === "lead" ? "lead-message" : "agent-message"}${evidenceMessage?.lead === lead.id && evidenceMessage.message === message.id ? " evidence-message" : ""}`} key={message.id}>
                  <div><span>{message.channel === "Voice" ? <Phone size={13} /> : <MessageSquareText size={13} />}{message.channel}</span><small>{message.time}</small></div>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "activity" && (
          <section className="activity-view">
            <div className="tab-intro"><div><span className="eyebrow">Visible ownership</span><h3>What happened and why</h3></div><span>Newest first</span></div>
            <p className="home-context">Recorded dates reflect local sample actions, not the fixed KPI day. Unknown times appear last.</p>
            <ol className="activity-list">
              {sortLeadActivity(lead.timelineItems).map((item) => {
                const activity = describeLeadActivity(item, activityNow);
                return (
                <li key={item.id}>
                  <span className={`activity-icon ${item.kind}`}>{item.kind === "call" ? <Phone size={14} /> : item.kind === "message" ? <MessageSquareText size={14} /> : item.kind === "decision" ? <ArrowRight size={14} /> : <CircleAlert size={14} />}</span>
                  <div><strong>{item.title}</strong><p>{item.detail}</p><p>{activity.actor}</p><p><time dateTime={activity.dateTime}>{activity.text}</time></p></div>
                </li>
              ); })}
            </ol>
          </section>
        )}
      </section>}
    </div>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`lead-status-pill status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ActionPanel({ session, cancel, lead, onUpdate, settled }: {
  session: ActionSession;
  cancel: () => void;
  lead: DemoLead;
  onUpdate: (session: ActionSession, update: Partial<DemoLead>, title: string, detail: string, command?: ActionCommand) => void;
  settled: boolean;
}) {
  const action = session.kind;
  const update = (changes: Partial<DemoLead>, title: string, detail: string) => onUpdate(session, changes, title, detail);
  if (action === "meeting") {
    const meeting = lead.appointments?.find(item => item.id === session.meetingId);
    return <div className="action-panel-inline">
      <p>Internal sample decision for meeting {session.meetingId}. Demo user records this decision; no message, cancellation notice or calendar update is sent.</p>
      <p>Keeping leaves the meeting confirmed. Cancelling changes only this meeting. Neither choice changes contact policy, response control or any other task.</p>
      {lead.status === "Do not contact" && <p>Contact and automatic reminders remain blocked with either choice.</p>}
      <div className="action-options">
        {session.canKeep && <button type="button" disabled={settled || !meeting} onClick={() => onUpdate(session, {}, "", "", { kind: "keep-meeting", meetingId: session.meetingId! })}><strong>Confirm keep meeting</strong></button>}
        <button type="button" disabled={settled || !meeting} onClick={() => onUpdate(session, {}, "", "", { kind: "cancel-meeting", meetingId: session.meetingId! })}><strong>Confirm cancel meeting</strong></button>
      </div>
      <button className="cancel-action" onClick={cancel} type="button">{settled ? "Close action" : "Back without changes"}</button>
    </div>;
  }
  if (action === "assign") return (
    <div className="action-panel-inline">
      <div><span>Assign an adviser and request handoff</span><p>This changes the lead owner and pauses AI response control in the sample. Acceptance is a separate explicit simulation. Meeting owner and time stay unchanged.</p></div>
      <div className="action-options">
        {sampleAdvisers.map(adviser => <button key={adviser.id} disabled={settled} onClick={() => onUpdate(session, {}, "", "", { kind: "request", target: adviser.id })} type="button"><strong>{adviser.name}</strong><small>{adviser.description}</small></button>)}
      </div>
      <button className="cancel-action" onClick={cancel} type="button">{settled ? "Close action" : "Cancel"}</button>
    </div>
  );

  if (action === "accept" || action === "return") {
    const handoff = lead.response?.handoff;
    const adviser = findSampleAdviser(handoff?.target);
    return <div className="action-panel-inline">
      <p>{action === "accept" ? "Demo user will simulate the selected adviser's acceptance. This is not a signed-in adviser accepting." : "Explicitly return response control to AI in the sample. Lead owner and meeting owner stay unchanged."}</p>
      <p>No message is sent and no live service is paused or activated.</p>
      <button type="button" disabled={settled || !handoff || !adviser} onClick={() => {
        if (handoff) onUpdate(session, {}, "", "", { kind: action, target: handoff.target, id: handoff.id });
      }}>{action === "accept" ? `Simulate acceptance by ${adviser?.name ?? "unknown adviser"}` : "Confirm return to AI in sample"}</button>
      <button className="cancel-action" onClick={cancel} type="button">{settled ? "Close action" : "Cancel"}</button>
    </div>;
  }

  if (action === "callback") return (
    <div className="action-panel-inline">
      <div><span>Schedule a callback</span><p>Choose a clear time. This creates owned work, not just a note. Today is 21 Sep 2026 in this fixed sample; tomorrow is 22 Sep. This is separate from the activity recording date.</p></div>
      <div className="action-options">
        <button disabled={settled} onClick={() => update({ status: "Callback scheduled", nextAction: "Confirm adviser and place callback", due: "Today · 7:30 PM", tasks: scheduleCallbackTask(lead, callbackSlots["Today · 7:30 PM"]) }, "Callback scheduled", `${lead.name} has a callback today at 7:30 PM.`)} type="button"><strong>Today · 7:30 PM</strong><small>Requested evening slot</small></button>
        <button disabled={settled} onClick={() => update({ status: "Callback scheduled", nextAction: "Confirm adviser and place callback", due: "Tomorrow · 11:30 AM", tasks: scheduleCallbackTask(lead, callbackSlots["Tomorrow · 11:30 AM"]) }, "Callback scheduled", `${lead.name} has a callback tomorrow at 11:30 AM.`)} type="button"><strong>Tomorrow · 11:30 AM</strong><small>Inside working hours</small></button>
      </div>
      <button className="cancel-action" onClick={cancel} type="button">{settled ? "Close action" : "Cancel"}</button>
    </div>
  );

  if (action === "nurture") return (
    <div className="action-panel-inline">
      <div><span>Move to nurture</span><p>Active sales follow-up stops. Choose when this lead should return for review.</p></div>
      <div className="action-options">
        <button disabled={settled} onClick={() => update({ status: "Nurture", nextAction: "Review new matching opportunities", due: "In 30 days" }, "Moved to nurture", `${lead.name} left active follow-up and will be reviewed in 30 days.`)} type="button"><strong>Review in 30 days</strong><small>For near-term future interest</small></button>
        <button disabled={settled} onClick={() => update({ status: "Nurture", nextAction: "Review new matching opportunities", due: "In 90 days" }, "Moved to nurture", `${lead.name} left active follow-up and will be reviewed in 90 days.`)} type="button"><strong>Review in 90 days</strong><small>For a longer buying timeline</small></button>
      </div>
      <button className="cancel-action" onClick={cancel} type="button">{settled ? "Close action" : "Cancel"}</button>
    </div>
  );

  return (
    <div className="action-panel-inline danger-panel">
      <div><span>Stop all contact</span><p>Block contact, AI replies, follow-ups and automatic reminders in this sample. Manual contact is not authorized. Confirmed meetings stay unchanged for a separate decision to keep or cancel them. This is not a temporary AI pause.</p></div>
      <div className="stop-confirmation"><ShieldOff size={18} /><p>Use this only when the customer asked not to be contacted or policy requires a stop.</p></div>
      <div className="danger-actions">
        <button disabled={settled} onClick={() => onUpdate(session, {}, "", "", { kind: "stop" })} type="button">Confirm stop</button>
        <button onClick={cancel} type="button">{settled ? "Close action" : "Keep active"}</button>
      </div>
    </div>
  );
}
