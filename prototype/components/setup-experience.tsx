"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { setupSteps } from "@/lib/prototype-data";
import { useSetup } from "@/components/setup-state";

const fields: Record<string, { label: string; hint: string; options?: string[] }> = {
  agency: { label: "Agency name", hint: "This name identifies your agency in the setup preview. Use a fictional name." },
  source: { label: "First lead source", hint: "Preview how enquiries enter your workspace. Account authorisation comes in the live product.", options: ["Meta Ads", "Property Finder", "Bayut"] },
  crm: { label: "Where lead records will live", hint: "Use the demo CRM to explore ownership and follow-up without an account connection.", options: ["Demo CRM", "Review Zoho connection later"] },
  whatsapp: { label: "Business number label", hint: "A label is enough for this preview. You do not need a phone number, password or verification code." },
  knowledge: { label: "Sample source to review", hint: "The sample contains dated project facts. Agents should use approved information to answer property questions.", options: ["Approved project sheet", "Agency FAQ"] },
  routing: { label: "Default adviser for this example", hint: "Demo context: Dubai time, English-language enquiries. Live working hours and routing are configured separately.", options: ["Sara · Off-plan adviser", "Omar · Investment adviser", "Sales manager"] },
  voice: { label: "Voice preview", hint: "You can leave this for later and still finish the demo setup. No telephone service is connected.", options: ["Review calling experience", "Plan agency phone connection later"] },
};

export function SetupExperience({ requestedStep }: { requestedStep?: string }) {
  const { state, ready, saved, sample, update } = useSetup();
  const requestedIndex = setupSteps.findIndex(step => step.id === requestedStep);
  const [localSelected, setLocalSelected] = useState<number | null>(requestedIndex >= 0 ? requestedIndex : null);
  const [reviewing, setReviewing] = useState(requestedIndex >= 0);
  const homeHref = sample ? "/home?mode=sample" : "/home";
  const [testPassed, setTestPassed] = useState(false);
  const detail = useRef<HTMLElement>(null);
  const { completed, skipped, values } = state;
  const selected = localSelected ?? state.selected;
  const step = setupSteps[selected];
  const required = setupSteps.filter(item => !item.optional);
  const done = required.every(item => completed.includes(item.id));
  const remaining = required.filter(item => !completed.includes(item.id) && item.id !== "test");
  const progress = Math.round(required.filter(item => completed.includes(item.id)).length / required.length * 100);
  const field = fields[step.id];

  function focusDetail() {
    requestAnimationFrame(() => {
      detail.current?.focus({ preventScroll: true });
      if (matchMedia("(max-width: 760px)").matches) detail.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function choose(index: number) { setLocalSelected(index); setReviewing(true); setTestPassed(false); focusDetail(); }
  function editValue(value: string) {
    update({ values: { ...values, [step.id]: value }, completed: completed.filter(id => id !== step.id && id !== "test") });
    setTestPassed(false);
  }
  function complete() {
    if (step.id === "test" && (remaining.length || !testPassed)) return;
    if (step.id !== "test" && !values[step.id]?.trim()) return;
    update({ completed: [...new Set([...completed, step.id])], skipped: skipped.filter(id => id !== step.id), selected: Math.min(7, selected + 1) });
    setLocalSelected(Math.min(7, selected + 1));
    if (step.id === "test") setReviewing(false);
    setTestPassed(false);
    focusDetail();
  }

  if (!ready) return <p role="status">Loading your setup progress…</p>;
  return (
    <div className="setup-layout">
      <section className="setup-list" aria-label="Setup steps">
        <div className="setup-progress-copy">
          <div><span>{required.filter(item => completed.includes(item.id)).length} of 7 required steps complete</span><strong>{progress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <p className="setup-save-note">{saved ? "Saved in this browser. You can leave and come back." : "Storage is unavailable. Progress lasts for this visit only."}</p>
        </div>
        <div className="step-list">
          {setupSteps.map((item, index) => (
            <button className={`setup-step ${selected === index ? "selected" : ""} ${completed.includes(item.id) ? "done" : ""}`} key={item.id} aria-current={selected === index ? "step" : undefined} onClick={() => choose(index)} type="button">
              <span className="step-state">{completed.includes(item.id) ? <Check size={16} /> : item.number}</span>
              <span className="step-copy"><strong>{item.title}</strong><small>{completed.includes(item.id) ? "Complete" : skipped.includes(item.id) ? "Left for later" : selected === index ? "Current step" : item.optional ? "Optional" : "Not started"}</small></span>
            </button>
          ))}
        </div>
        <Link className="text-link setup-exit" href={homeHref}>Save & leave setup <ArrowRight size={15} /></Link>
      </section>
      <section className="setup-detail" ref={detail} tabIndex={-1}>
        {done && !reviewing ? <>
          <span className="eyebrow">Setup preview complete</span>
          <h2>Your demo workspace is ready</h2>
          <p className="detail-lede">Your choices are saved. Start with a sample lead to try assigning an adviser or planning a callback.</p>
          <dl className="setup-review">
            <div><dt>Agency</dt><dd>{values.agency}</dd></div>
            <div><dt>Lead source</dt><dd>{values.source}</dd></div>
            <div><dt>Default adviser</dt><dd>{values.routing}</dd></div>
            <div><dt>Voice</dt><dd>{completed.includes("voice") ? "Preview reviewed" : "Left for later"}</dd></div>
          </dl>
          <p className="setup-save-note">These settings are a setup preview. Sample leads and the guided story use their own fictional data. Nothing has been activated.</p>
          <Link className="button primary" href="/home?mode=sample">Explore sample workspace <ArrowRight size={17} /></Link>
          <button className="text-link setup-exit" type="button" onClick={() => choose(0)}>Review setup choices</button>
        </> : <>
          <div className="detail-topline"><span>Step {step.number} of 8</span>{step.optional && <span className="soft-badge">Optional</span>}</div>
          <h2>{step.title}</h2>
          <p className="detail-lede">{step.description}</p>
          {step.id === "test" ? <div className="setup-test">
            {remaining.length ? <>
              <p>Finish {remaining.length} required {remaining.length === 1 ? "step" : "steps"} before running the sample check.</p>
              <button className="button primary" onClick={() => choose(setupSteps.findIndex(item => item.id === remaining[0].id))}>Continue: {remaining[0].title}</button>
            </> : <>
              <p>Check a fictional enquiry from {values.source}. This previews the saved setup and does not test a live integration.</p>
              <button className="button secondary" onClick={() => setTestPassed(true)}>Run sample check</button>
              {testPassed && <div className="setup-test-result" role="status"><Check size={20} /><p>Sample enquiry received. Agency details and knowledge source are present. The example next action belongs to {values.routing}.</p></div>}
            </>}
          </div> : <div className="demo-form">
            <label htmlFor={`setup-${step.id}`}>{field.label}</label>
            {field.options ? <select id={`setup-${step.id}`} value={values[step.id]} onChange={event => editValue(event.target.value)}>{field.options.map(option => <option key={option}>{option}</option>)}</select>
              : <input id={`setup-${step.id}`} value={values[step.id] ?? ""} maxLength={100} onChange={event => editValue(event.target.value)} />}
            <p className="setup-save-note">{field.hint}</p>
          </div>}
          {step.id !== "test" && <div className="setup-preview"><span className="preview-label">In the live product</span><h3>{step.outcome}</h3></div>}
          <div className="detail-actions">
            <button className="button primary" onClick={complete} disabled={step.id === "test" ? remaining.length > 0 || !testPassed : !values[step.id]?.trim()}>{step.id === "test" ? "Finish setup preview" : "Save and continue"}<ArrowRight size={17} /></button>
            {step.optional && <button className="button ghost" onClick={() => { update({ skipped: ["voice"], completed: completed.filter(id => id !== "voice"), selected: 7 }); setLocalSelected(7); focusDetail(); }}>Leave voice for later</button>}
          </div>
          <div className="setup-footer-nav"><button disabled={selected === 0} onClick={() => choose(selected - 1)}><ArrowLeft size={15} /> Previous</button><Link href={homeHref}>Leave setup <ArrowRight size={15} /></Link></div>
        </>}
      </section>
    </div>
  );
}
