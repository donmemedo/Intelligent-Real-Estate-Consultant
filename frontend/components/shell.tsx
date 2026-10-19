"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Bot, House, LogOut, Route, Sparkles, Users } from "lucide-react";
import { createContext, use, type ReactNode } from "react";
import { api, useApi, type User } from "@/lib/api";
import { ThemeToggle } from "./ui";

const nav = [
  { href: "/home", label: "Today", Icon: House },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/team", label: "AI Team", Icon: Bot },
  { href: "/journey", label: "Journey", Icon: Route },
];

const MeContext = createContext<User | null>(null);
/** The signed-in user. Only used inside the (app) routes, which render after /auth/me succeeds. */
export const useMe = () => use(MeContext)!;

export const Brand = () => (
  <Link href="/" className="brand"><span className="logo"><Sparkles size={16} /></span><span className="brand-name">IREC</span></Link>
);

async function signOut() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.assign("/login");
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me, error } = useApi<User>("/auth/me", 60_000); // a 401 redirects to /login
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Main">
          {nav.map(({ href, label, Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link key={href} href={href} className="nav-link" aria-current={active ? "page" : undefined}>
                {active && <motion.span layoutId="nav-pill" className="nav-pill" />}
                <Icon size={19} /><span className="nav-label">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          {me && <span className="chip" title={me.email}>{me.name} · {me.role.replace("_", " ")}</span>}
          <ThemeToggle />
          <button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="content">
        {me ? <MeContext value={me}>{children}</MeContext> : <p className="muted" role="status">{error ?? "Loading…"}</p>}
      </main>
    </div>
  );
}
