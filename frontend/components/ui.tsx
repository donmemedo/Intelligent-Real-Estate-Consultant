"use client";

import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

const statusTone: Record<string, string> = {
  New: "blue", "In conversation": "violet", Qualified: "green", "Waiting for adviser": "amber",
  "Callback scheduled": "teal", Nurture: "gray", "Do not contact": "red",
};

export const Pill = ({ status }: { status: string }) => <span className="pill" data-tone={statusTone[status] ?? "gray"}>{status}</span>;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";

export const Avatar = ({ name, big }: { name: string; big?: boolean }) => (
  <span className={big ? "avatar avatar-lg" : "avatar"} data-tone="blue" aria-hidden>{initials(name)}</span>
);

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div><p className="eyebrow">{eyebrow}</p><h1 className="large-title">{title}</h1></div>
      {action}
    </header>
  );
}

export function Counter({ value }: { value: string }) {
  const n = Number(value);
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => Math.round(v).toLocaleString());
  useEffect(() => {
    if (!Number.isFinite(n)) return;
    const run = animate(mv, n, { type: "spring", bounce: 0, duration: 1.4 });
    return () => run.stop();
  }, [n, mv]);
  return Number.isFinite(n) ? <motion.span>{text}</motion.span> : <span>{value}</span>;
}

export const Reveal = ({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }} transition={{ type: "spring", bounce: 0, duration: 0.8, delay }}>
    {children}
  </motion.div>
);

// Apple's momentum projection: where a flick would come to rest.
const project = (velocity: number, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer" key="sheet">
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="sheet" role="dialog" aria-modal="true" aria-label={label}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 1 }}
            onDragEnd={(_, info) => { if (info.offset.y + project(info.velocity.y) > 200) onClose(); }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0.12, duration: 0.5 }}>
            <div className="grabber-zone" onPointerDown={e => drag.start(e)}><span className="grabber" /></div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setDark(saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const next = dark ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      setDark(!dark);
      try { localStorage.setItem("theme", next); } catch {}
    };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    // The new appearance grows as a circle out of the button that asked for it.
    const b = e.currentTarget.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => flushSync(apply)).ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
      ));
  };

  return (
    <button className="icon-btn" onClick={toggle} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>
      {dark === null ? null : dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
