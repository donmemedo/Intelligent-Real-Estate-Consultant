import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck2, CheckCircle2, MessageCircleMore, UserRoundCheck } from "lucide-react";
import { DemoNotice } from "@/components/demo-notice";

const outcomes = [
  { icon: MessageCircleMore, title: "Every new lead gets a response", copy: "Start the right conversation while the enquiry is still fresh." },
  { icon: UserRoundCheck, title: "Qualified leads reach the right person", copy: "Share the need, context and agreed next step - not just a phone number." },
  { icon: CalendarCheck2, title: "Follow-up becomes real work", copy: "Turn promises into callbacks, meetings and visible ownership." },
];

export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <div className="brand standalone">
          <span className="brand-mark"><Bot size={21} /></span>
          <span><strong>PropAgent</strong><small>AI sales team for real estate</small></span>
        </div>
        <DemoNotice />
      </header>

      <section className="welcome-hero">
        <div className="hero-copy">
          <span className="eyebrow">Your agency&apos;s next shift starts here</span>
          <h1>Every lead gets a timely, informed next step.</h1>
          <p>PropAgent helps your team respond, qualify, answer property questions and hand the right opportunity to a human adviser.</p>
          <div className="hero-actions">
          <Link className="button primary large" href="/demo">See how PropAgent works <ArrowRight size={18} /></Link>
          <Link className="button ghost large" href="/setup">Set up your AI team</Link>
          </div>
          <div className="trust-line">
            <CheckCircle2 size={17} />
            <span>Safe fictional data · no calls, messages or CRM writes</span>
          </div>
          <ol className="welcome-route" aria-label="Recommended walkthrough">
            <li><Link href="/demo"><strong>1. Follow a lead</strong><span>Try choices and see the next step change.</span></Link></li>
            <li><Link href="/setup"><strong>2. Set up your agency</strong><span>Choose sample settings and save your progress.</span></Link></li>
            <li><Link href="/leads?mode=sample"><strong>3. Try the workspace</strong><span>Open a fictional lead and assign or schedule follow-up safely.</span></Link></li>
          </ol>
        </div>

        <div className="hero-visual" aria-label="Example lead result">
          <div className="hero-visual-head">
            <span>Lead handled</span>
            <strong>2m 14s</strong>
          </div>
          <div className="mini-conversation">
            <div className="message lead">I&apos;m looking for a two-bedroom off-plan property.</div>
            <div className="message agent">Got it. What budget range would feel comfortable?</div>
            <div className="message lead">Up to AED 2.2M. I&apos;d like to buy this year.</div>
          </div>
          <div className="hero-result">
            <span className="result-icon"><CheckCircle2 size={19} /></span>
            <div><strong>Qualified and ready for an adviser</strong><small>Budget, timeline and preferred area captured</small></div>
          </div>
        </div>
      </section>

      <section className="outcome-strip" aria-label="What PropAgent does">
        {outcomes.map(({ icon: Icon, title, copy }) => (
          <article key={title}>
            <Icon size={20} />
            <div><h2>{title}</h2><p>{copy}</p></div>
          </article>
        ))}
      </section>
    </main>
  );
}
