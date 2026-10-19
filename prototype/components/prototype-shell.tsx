"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Bot, Home, Inbox, CircleHelp, Menu, X, Settings2, Sparkles, Users } from "lucide-react";
import { DemoNotice } from "@/components/demo-notice";

// Product navigation rules: docs/product/navigation.md
const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/leads", label: "Leads", icon: Inbox },
  { href: "/team", label: "AI Team", icon: Users },
  { href: "/setup", label: "Setup", icon: Settings2 },
];

type ShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  homeBadge?: string;
  sampleMode?: boolean;
};

export function PrototypeShell(props: ShellProps) {
  return <Suspense fallback={<p role="status">Loading workspace…</p>}><WorkspaceShell {...props} /></Suspense>;
}

function WorkspaceShell({
  children,
  eyebrow,
  title,
  description,
  homeBadge,
  sampleMode = false,
}: ShellProps) {
  const pathname = usePathname();
  const query = useSearchParams();
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 981px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const sample = pathname === "/home" ? sampleMode : query.get("mode") === "sample";
  const route = (href: string) => sample ? href + "?mode=sample" : href;
  const closeDrawer = () => drawer.current?.close();

  const navigation = <>
        <Link className="brand" href={route("/home")} aria-label="PropAgent home">
          <span className="brand-mark"><Bot size={21} /></span>
          <span>
            <strong>PropAgent</strong>
            <small>Agency workspace</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href === "/team" && pathname.startsWith("/agents/"));
            const Icon = item.icon;
            return (
              <Link className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined} href={route(item.href)} key={item.href}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-support">
          {sample && <div className="sidebar-sample"><strong>Sample workspace</strong><span>No customer actions</span><a href="/home">Back to my workspace</a></div>}
          <details className="sidebar-help">
            <summary className="nav-item"><CircleHelp size={18} aria-hidden="true" /><span>Help &amp; Demo</span></summary>
            <nav aria-label="Help and demo">
              <Link className="nav-item" href="/welcome">Getting started</Link>
              <Link className="nav-item" href="/home?mode=sample">Explore sample workspace</Link>
              <Link className="nav-item" href="/demo?mode=sample">Guided demo</Link>
            </nav>
          </details>
          <div className="sidebar-note">
          <Sparkles size={17} aria-hidden="true" />
          <div>
            <strong>{sample ? "Sample workspace" : "Agency workspace"}</strong>
            <span>Dubai residential sales</span>
          </div>
          </div>
        </div>
  </>;

  return (
    <div className={pathname === "/home" ? "app-frame home-page" : "app-frame"}>
      <a className="workspace-skip" href="#workspace-content">Skip to content</a>
      <aside className="sidebar desktop-sidebar">{navigation}</aside>
      <div className="mobile-navigation-bar">
        <button ref={menuButton} className="navigation-button" type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="workspace-navigation" onClick={() => drawer.current?.showModal()}><Menu size={20} aria-hidden="true" /><span>Menu</span></button>
        <span>PropAgent</span>
      </div>
      <dialog ref={drawer} id="workspace-navigation" className="navigation-drawer" aria-label="Workspace navigation" onClose={() => menuButton.current?.focus()} onClick={event => { if (event.target === event.currentTarget || (event.target instanceof Element && event.target.closest("a"))) closeDrawer(); }}>
        <div className="sidebar drawer-sidebar">
          <button className="navigation-button drawer-close" type="button" aria-label="Close navigation" onClick={closeDrawer} autoFocus><X size={20} aria-hidden="true" /><span>Close</span></button>
          {navigation}
        </div>
      </dialog>

      <main className="main-area" id="workspace-content" tabIndex={-1}>
        <header className="page-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {homeBadge || sample ? <div className="demo-notice" role="note"><span>{homeBadge ?? "Sample workspace · No customer actions"}</span></div> : <DemoNotice />}
        </header>
        <div className="page-content">{children}</div>
        <footer className="workspace-guide"><Link href="/welcome">New here? Start the walkthrough</Link><span>{pathname === "/home" ? "Story → Setup → Leads" : "Story → Setup → Sample leads"}</span></footer>
      </main>
    </div>
  );
}
