"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Pause, Play, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { goldenPath } from "@/lib/prototype-data";

const last = goldenPath.length - 1;

export default function Journey() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (i === last) return setPlaying(false);
    const t = setTimeout(() => setI(i + 1), 2600);
    return () => clearTimeout(t);
  }, [playing, i]);

  const stage = goldenPath[i];
  const context = [...new Set(goldenPath.slice(0, i + 1).flatMap(s => s.sharedContext))];
  const play = () => { if (!playing && i === last) setI(0); setPlaying(!playing); };

  return (
    <div className="page">
      <PageHeader eyebrow="Seven stages · one owner at a time" title="Lead journey"
        action={<button className="btn btn-primary" onClick={play}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause" : "Play journey"}</button>} />
      <div className="stepper-wrap">
        <span className="track"><motion.span className="track-fill" initial={false} animate={{ scaleX: i / last }} /></span>
        <ol className="stepper">
          {goldenPath.map((s, n) => (
            <li key={s.id}>
              <button onClick={() => { setPlaying(false); setI(n); }} aria-current={n === i ? "step" : undefined} data-done={n < i} aria-label={`Stage ${s.label}: ${s.title}`}>
                <span className="step-num">{s.label}</span><span className="step-label">{s.actor}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid-2">
        <AnimatePresence mode="wait">
          <motion.article key={stage.id} className="card stage" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <p className="eyebrow">Stage {stage.label} · {stage.actor}</p>
            <h2 className="title-1">{stage.title}</h2>
            <p className="lede">{stage.description}</p>
            <p className="outcome"><CircleCheck size={18} /> {stage.outcome}</p>
            <p className="row muted"><UserRound size={16} /> Next owner <strong className="fg">{stage.nextOwner}</strong></p>
          </motion.article>
        </AnimatePresence>
        <aside className="card">
          <h3 className="card-title">Shared context</h3>
          <p className="muted small" style={{ marginBottom: 14 }}>What the next owner receives, so nobody asks twice.</p>
          <ul className="chips">
            <AnimatePresence initial={false}>
              {context.map(c => (
                <motion.li key={c} layout className="chip" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>{c}</motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </aside>
      </div>
    </div>
  );
}
