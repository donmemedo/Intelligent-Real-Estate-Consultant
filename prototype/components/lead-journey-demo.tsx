"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { goldenPath } from "@/lib/prototype-data";

export function LeadJourneyDemo({ sampleMode = false }: { sampleMode?: boolean }) {
  const journey = useRef<HTMLDivElement>(null);
  useEffect(() => { if (journey.current) journey.current.dataset.ready = "true"; }, []);
  const [current, setCurrent] = useState(0);
  const stage = goldenPath[current];
  const done = current === goldenPath.length - 1;

  return (
    <div className="journey-demo" ref={journey}>
      <div className="journey-rail" aria-label="Lead journey progress">
        {goldenPath.map((item, index) => (
          <button
            className={`${index === current ? "current" : ""} ${index < current ? "complete" : ""}`}
            key={item.id}
            onClick={() => setCurrent(index)}
            type="button"
          >
            <span>{index < current ? <Check size={15} /> : item.label}</span>
            <small>{item.actor}</small>
          </button>
        ))}
      </div>

      <section className="journey-stage">
        <div className="stage-context">
          <span className="eyebrow">{stage.actor}</span>
          <span className="stage-count">Stage {current + 1} of {goldenPath.length}</span>
        </div>
        <h2>{stage.title}</h2>
        <p>{stage.description}</p>

        <div className="lead-card">
          <div className="lead-avatar">MK</div>
          <div>
            <strong>Maya Khan</strong>
            <span>Meta enquiry · Off-plan · English</span>
          </div>
          <span className="lead-status">Demo lead</span>
        </div>

        <div className="journey-context-card">
          <span>Shared customer context</span>
          <div>{stage.sharedContext.map((item) => <small key={item}>{item}</small>)}</div>
        </div>

        <div className="journey-state-grid">
          <div className="outcome-box">
            <span>Visible result</span>
            <strong>{stage.outcome}</strong>
          </div>
          <div className="journey-owner-box">
            <span>Next-action owner</span>
            <strong>{stage.nextOwner}</strong>
          </div>
        </div>

        <div className="journey-actions">
          <button className="button ghost" disabled={current === 0} onClick={() => setCurrent(current - 1)} type="button">
            <ArrowLeft size={17} /> Back
          </button>
          {done ? (
            <div className="journey-complete-actions">
              <button className="button ghost" onClick={() => setCurrent(0)} type="button"><RotateCcw size={17} /> Replay journey</button>
              <Link className="button primary" href={sampleMode ? "/demo?mode=sample" : "/demo"}>Try the branching decisions <ArrowRight size={17} /></Link>
            </div>
          ) : (
            <button className="button primary" onClick={() => setCurrent(current + 1)} type="button">
              Continue <ArrowRight size={17} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
