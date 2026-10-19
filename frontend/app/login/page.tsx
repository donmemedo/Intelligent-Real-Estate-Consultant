"use client";

import { LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Brand } from "@/components/shell";
import { ThemeToggle } from "@/components/ui";
import { api, safeNext } from "@/lib/api";

function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", json: { email: form.get("email"), password: form.get("password") } });
      window.location.assign(next); // full load: the shell fetches the new session
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    // method="post": a submit before hydration must never put the password in the URL.
    <form className="card login-card" method="post" onSubmit={submit}>
      <h1 className="title-2">Sign in to IREC</h1>
      <label className="field">Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
      {error && <p className="note" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}><LogIn size={16} /> {busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login">
      <header className="row login-bar"><Brand /><ThemeToggle /></header>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
