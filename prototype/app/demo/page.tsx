import { GuidedProductDemo } from "@/components/guided-product-demo";
import { PrototypeShell } from "@/components/prototype-shell";

export default function GuidedDemoPage() {
  return (
    <PrototypeShell
      eyebrow="Start here"
      title="Handle one lead yourself"
      description="Make the decisions PropAgent makes, watch the shared customer context change and see who owns every next action."
    >
      <section className="orientation-strip">
        <div><span>1</span><p><strong>A lead arrives</strong> with source context</p></div>
        <div><span>2</span><p><strong>You choose</strong> what should happen</p></div>
        <div><span>3</span><p><strong>The journey changes</strong> and ownership stays visible</p></div>
      </section>
      <GuidedProductDemo />
    </PrototypeShell>
  );
}
