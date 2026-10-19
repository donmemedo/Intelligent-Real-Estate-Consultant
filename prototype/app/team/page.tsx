import { TeamWorkspace } from "@/components/team-workspace";
import { SetupProvider } from "@/components/setup-state";
import "./team.css";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sampleMode = (await searchParams).mode === "sample";
  const content = <TeamWorkspace sampleMode={sampleMode} />;
  return sampleMode ? <SetupProvider sample>{content}</SetupProvider> : content;
}
