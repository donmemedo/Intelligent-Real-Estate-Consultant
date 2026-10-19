"use client";

import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { BadgeCheck, Bot } from "lucide-react";
import { useEffect, useState, type PointerEvent } from "react";
import { initialDemoLeads } from "@/lib/demo-leads";

const maya = initialDemoLeads.find(lead => lead.id === "maya-khan")!;
const total = maya.messages.length;

// Replays the real sample conversation, then holds on the outcome before looping.
export function LiveChat() {
  const still = useReducedMotion();
  const [shown, setShown] = useState(0);
  const tiltX = useSpring(0, { bounce: 0, duration: 0.6 });
  const tiltY = useSpring(0, { bounce: 0, duration: 0.6 });

  useEffect(() => {
    if (still) return setShown(total);
    const t = setTimeout(() => setShown(n => (n >= total ? 0 : n + 1)), shown === 0 ? 900 : shown < total ? 1700 : 4200);
    return () => clearTimeout(t);
  }, [shown, still]);

  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    tiltX.set(((e.clientY - r.top) / r.height - 0.5) * -10);
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 12);
  };

  return (
    <motion.div className="phone" style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }}
      onPointerMove={tilt} onPointerLeave={() => { tiltX.set(0); tiltY.set(0); }}
      initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", bounce: 0, duration: 1, delay: 0.15 }}>
      <header className="chat-head">
        <span className="avatar" data-tone="violet">{maya.initials}</span>
        <span className="text"><strong>{maya.name}</strong><span className="muted small ellipsis">WhatsApp · {maya.campaign}</span></span>
        <span className="live"><Bot size={14} /> Lead Agent</span>
      </header>
      <div className="chat" aria-live="polite">
        <AnimatePresence>
          {maya.messages.slice(0, shown).map(m => (
            <motion.div key={m.id} layout className="bubble" data-from={m.from} style={{ originX: m.from === "agent" ? 1 : 0, originY: 1 }}
              initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
              {m.text}<span>{m.from === "agent" ? "AI draft within policy · " : ""}{m.time}</span>
            </motion.div>
          ))}
          {shown < total && (
            <motion.div key={`typing-${shown}`} layout className="bubble typing" data-from={maya.messages[shown].from} aria-label="Typing"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              <i /><i /><i />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {shown >= total && (
          <motion.p className="qualified" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <BadgeCheck size={18} /> {maya.status} · next owner: {maya.owner}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
