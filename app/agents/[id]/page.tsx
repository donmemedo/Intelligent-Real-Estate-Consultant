import { notFound } from "next/navigation";
import { AgentWorkspace } from "@/components/agent-workspace";
import { SetupProvider } from "@/components/setup-state";
import { journeys } from "@/lib/prototype-data";
import { journeyScenarios } from "@/lib/journey-scenarios";
import "../agent-workspace.css";

export function generateStaticParams() {
  return journeys.map((journey) => ({ id: journey.id }));
}

export default async function AgentJourneyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { id } = await params;
  const agent = journeys.find((item) => item.id === id);
  if (!agent) notFound();
  const scenarios = journeyScenarios[agent.id];
  if (!scenarios) notFound();
  const reviewIndex = journeys.findIndex((item) => item.id === agent.id);
  const nextAgent = journeys[reviewIndex + 1];

  const sampleMode = (await searchParams).mode === "sample";
  const content = <AgentWorkspace agent={agent} scenarios={scenarios} sampleMode={sampleMode} reviewPosition={reviewIndex + 1} reviewTotal={journeys.length} nextAgent={nextAgent} />;
  return sampleMode ? <SetupProvider sample>{content}</SetupProvider> : content;
}
