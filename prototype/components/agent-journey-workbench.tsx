"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Play, RotateCcw, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { JourneyScenario } from "@/lib/journey-scenarios";

export function AgentJourneyWorkbench({ scenarios }: { scenarios: JourneyScenario[] }) {
  const [selected, setSelected] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [branch, setBranch] = useState<"normal" | "exception" | null>(null);
  const workbench = useRef<HTMLElement>(null);
  useEffect(() => { if (workbench.current) workbench.current.dataset.ready = "true"; }, []);
  const scenario = scenarios[selected];
  const pathComplete = completedSteps === scenario.steps.length;

  const chooseScenario = (index: number) => {
    setSelected(index);
    setCompletedSteps(0);
    setBranch(null);
  };

  const restart = () => {
    setCompletedSteps(0);
    setBranch(null);
  };

  return (
    <section className="workbench panel" ref={workbench}>
      <aside className="scenario-list" aria-label="Journey scenarios">
        <span className="eyebrow">Choose a scenario</span>
        {scenarios.map((item, index) => (
          <button
            className={selected === index ? "selected" : ""}
            key={item.title}
            onClick={() => chooseScenario(index)}
            aria-pressed={selected === index}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.title}</strong>
            <ArrowRight size={14} />
          </button>
        ))}
      </aside>

      <div className="scenario-detail">
        <div className="scenario-heading">
          <div>
            <span className="eyebrow">Scenario {selected + 1} of {scenarios.length} · Trigger</span>
            <h2>{scenario.title}</h2>
            <p>{scenario.trigger}</p>
          </div>
          <span className="simulation-pill">Safe simulation</span>
        </div>

        <div className="scenario-path" aria-label={`${scenario.title} workflow`}>
          {scenario.steps.map((step, index) => (
            <div className={`path-step ${index < completedSteps ? "path-complete" : index === completedSteps ? "path-current" : "path-upcoming"}`} key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
              {index < scenario.steps.length - 1 && <ArrowRight aria-hidden="true" size={17} />}
            </div>
          ))}
        </div>

        <div className="scenario-runner" aria-live="polite">
          <div>
            <span className="eyebrow">Try the scenario</span>
            <strong>{pathComplete ? "The path is ready for a decision" : `Step ${completedSteps + 1} of ${scenario.steps.length}: ${scenario.steps[completedSteps]}`}</strong>
            <p>{pathComplete ? "Choose whether the normal path completes or the main exception occurs." : "Advance one step at a time. No customer action or external system is used."}</p>
          </div>
          <div className="scenario-runner-actions">
            {!pathComplete && <button className="button primary" type="button" onClick={() => setCompletedSteps((current) => Math.min(current + 1, scenario.steps.length))}>
              <Play size={15} /> {completedSteps === 0 ? "Start simulation" : "Run next step"}
            </button>}
            {(completedSteps > 0 || branch) && <button className="button ghost" type="button" onClick={restart}><RotateCcw size={14} /> Restart</button>}
          </div>
        </div>

        {pathComplete && !branch && <div className="scenario-branch-choice">
          <span>What happens at the decision point?</span>
          <button type="button" onClick={() => setBranch("normal")}><CheckCircle2 size={18} /><strong>Complete the normal path</strong><small>Show the expected result and next owner.</small></button>
          <button type="button" onClick={() => setBranch("exception")}><AlertTriangle size={18} /><strong>Trigger the main exception</strong><small>Show how the path fails safely without losing ownership.</small></button>
        </div>}

        <div className="scenario-results" aria-live="polite">
          <article className={`result-card ${branch === "exception" ? "warning-result" : branch === "normal" ? "success" : "pending-result"}`}>
            {branch === "exception" ? <ShieldCheck size={19} /> : branch === "normal" ? <CheckCircle2 size={19} /> : <CircleDot size={19} />}
            <div><span>{branch === "exception" ? "Safe exception result" : branch === "normal" ? "Visible result" : "Result pending"}</span><strong>{branch === "exception" ? scenario.exception : branch === "normal" ? scenario.result : "Run the path and choose an outcome to reveal the result."}</strong></div>
          </article>
          <article className="result-card owner">
            <UserRoundCheck size={19} />
            <div><span>Next-action owner</span><strong>{branch === "exception" ? (scenario.exceptionOwner ?? scenario.nextOwner) : branch === "normal" ? scenario.nextOwner : "Assigned after the decision"}</strong></div>
          </article>
        </div>

        {branch && <div className="scenario-follow-through">
          <p>{selected < scenarios.length - 1 ? "Compare the other outcome, then continue to the next scenario." : "You are on the last scenario. Compare the other outcome or use the workspace link below to continue."}</p>
          <div>
            <button className="button secondary" type="button" onClick={() => setBranch(branch === "normal" ? "exception" : "normal")}>Try the {branch === "normal" ? "exception" : "normal"} outcome</button>
            {selected < scenarios.length - 1 && <button className="button primary" type="button" onClick={() => chooseScenario(selected + 1)}>Next scenario <ArrowRight size={15} /></button>}
          </div>
        </div>}

        <div className={`exception-note ${branch === "exception" ? "exception-active" : ""}`}>
          <AlertTriangle size={17} />
          <div><span>Main exception to test</span><p>{scenario.exception}</p></div>
          <CircleDot size={14} />
        </div>
      </div>
    </section>
  );
}
