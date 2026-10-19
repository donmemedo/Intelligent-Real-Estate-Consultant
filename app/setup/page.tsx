import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { DemoNotice } from "@/components/demo-notice";
import { SetupExperience } from "@/components/setup-experience";
import { SetupProvider } from "@/components/setup-state";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; mode?: string }> }) {
  const params = await searchParams;
  const content = <SetupExperience key={params.step ?? "resume"} requestedStep={params.step} />;
  return (
    <main className="setup-page">
      <header className="setup-header">
        <Link className="brand standalone" href="/welcome">
          <span className="brand-mark"><Bot size={21} /></span>
          <span><strong>PropAgent</strong><small>Guided setup</small></span>
        </Link>
        {params.mode === "sample" ? <div className="demo-notice">Sample workspace · No customer actions</div> : <DemoNotice />}
      </header>
      <div className="setup-title-row">
        <div>
          <Link className="back-link" href="/home"><ArrowLeft size={15} /> {params.mode === "sample" ? "Back to my workspace" : "Back to Home"}</Link>
          <span className="eyebrow">Get ready to handle your first lead</span>
          <h1>Set up your AI team</h1>
          <p>Seven required steps and one optional voice step. Use sample settings, save your progress and finish with a sample check. No accounts are connected.</p>
        </div>
      </div>
      {params.mode === "sample" ? <SetupProvider sample>{content}</SetupProvider> : content}
    </main>
  );
}
