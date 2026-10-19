import { LeadsWorkspace } from "@/components/leads-workspace";
import "./continuation.css";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ mode?: string; state?: string }> }) {
  const params = await searchParams;
  return <LeadsWorkspace mode={params.mode} previewState={params.state} />;
}
