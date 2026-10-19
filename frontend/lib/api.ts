"use client";

import { useCallback, useEffect, useState } from "react";

// Shapes returned by the IREC API (backend/app/schemas.py).
export type Role = "adviser" | "manager" | "agency_admin" | "operator";
export type User = { id: string; agency_id: string; email: string; name: string; role: Role };
export type Lead = {
  id: string; name: string | null; phone: string; status: string; response_state: "ai" | "paused" | "human";
  owner_user_id: string | null; last_inbound_at: string | null; updated_at: string;
};
export type Handoff = { id: string; target_user_id: string; status: "requested" | "accepted"; created_at: string; accepted_at: string | null };
export type ConversationItem = { direction: "in" | "out"; body: string; at: string; status: string | null };
export type LeadDetail = Lead & { open_handoff: Handoff | null; conversation: ConversationItem[] };
export type ActionResult = { changed: boolean; message: string };

export const SUPERVISORS: Role[] = ["manager", "agency_admin"];

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Same-origin call to the backend. Cookies travel automatically; the browser adds Origin on POST (CSRF check). */
export async function api<T>(path: string, options: { method?: string; json?: unknown; headers?: HeadersInit } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: { ...(options.json !== undefined && { "Content-Type": "application/json" }), ...options.headers },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiError(response.status, data?.error?.message ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

/** Load `path` now and every `pollMs` while the tab is visible, so new WhatsApp messages show up. */
export function useApi<T>(path: string | null, pollMs = 10_000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [path]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => !document.hidden && void reload(), pollMs);
    return () => clearInterval(timer);
  }, [reload, pollMs]);
  return { data, error, reload };
}

/** Idempotency key for one draft. getRandomValues also works on plain-http LAN origins, unlike randomUUID. */
export const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");

export { safeNext } from "./safe-next";
