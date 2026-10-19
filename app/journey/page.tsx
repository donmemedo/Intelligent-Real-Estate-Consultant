import { PrototypeShell } from "@/components/prototype-shell";
import { LeadJourneyDemo } from "@/components/lead-journey-demo";
import "./journey.css";

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sampleMode = (await searchParams).mode === "sample";
  return (
    <PrototypeShell
      sampleMode={sampleMode}
      eyebrow="Interactive lead story"
      title="Follow one lead from enquiry to an owned next step"
      description="This safe demo shows how the roles work together. It does not contact a real lead or external service."
    >
      <LeadJourneyDemo sampleMode={sampleMode} />
    </PrototypeShell>
  );
}
