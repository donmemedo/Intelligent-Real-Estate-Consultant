"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { setupSteps } from "@/lib/prototype-data";

type SetupState = { selected: number; completed: string[]; skipped: string[]; values: Record<string, string> };
const initial: SetupState = { selected: 0, completed: [], skipped: [], values: {
  agency: "Harbour & Key Real Estate", source: "Meta Ads", crm: "Demo CRM", whatsapp: "Agency business number",
  knowledge: "Approved project sheet", routing: "Sara · Off-plan adviser", voice: "Review calling experience",
} };
const key = "propagent-setup-v1";
const SetupContext = createContext<{
  state: SetupState; ready: boolean; saved: boolean; sample: boolean;
  update: (change: Partial<SetupState>) => void;
} | null>(null);

export function SetupProvider({ children, sample = false }: { children: React.ReactNode; sample?: boolean }) {
  const storageKey = sample ? "propagent-sample-setup-v1" : key;
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const data = JSON.parse(raw);
          const ids = setupSteps.map(step => step.id);
          if (Array.isArray(data.completed) && Array.isArray(data.skipped) && data.values && typeof data.values === "object") {
            setState({ selected: Number.isInteger(data.selected) ? Math.max(0, Math.min(7, data.selected)) : 0,
              completed: data.completed.filter((id: string) => ids.includes(id)),
              skipped: data.skipped.filter((id: string) => id === "voice"),
              values: { ...initial.values, ...Object.fromEntries(Object.entries(data.values).filter((entry): entry is [string, string] => typeof entry[1] === "string")) } });
          }
        }
      } catch { setSaved(false); }
      setReady(true);
    });
    return () => { active = false; };
  }, [storageKey]);

  function update(change: Partial<SetupState>) {
    const next = { ...state, ...change };
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(true); }
    catch { setSaved(false); }
  }
  return <SetupContext.Provider value={{ state, ready, saved, sample, update }}>{children}</SetupContext.Provider>;
}

export function useSetup() {
  const context = useContext(SetupContext);
  if (!context) throw new Error("SetupProvider is required");
  return context;
}
