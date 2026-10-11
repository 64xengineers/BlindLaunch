import { ClearingSimulator, ComparisonSection, FaqSection, SectionHeading, StepsSection, TeamsCta } from "../components/sections";
import { BotRaceDemo, CostsPanel, PrivacySection, RiskNotice } from "../components/trust";
import { Badge, Reveal, SecondaryButton } from "../components/ui";

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <section className="rise max-w-3xl py-6">
        <Badge>How it works</Badge>
        <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl">A launch where speed does not win.</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
          Everyone bids inside the same window. Nobody can read the bids until it closes. Then one price is found, and every winner pays it.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a className="btn-primary inline-flex items-center justify-center no-underline" href="#simulator"><span className="relative z-10">Try the sandbox</span></a>
          <SecondaryButton to="/">Browse auctions</SecondaryButton>
        </div>
      </section>
      <StepsSection />
      <div id="simulator" className="scroll-mt-6"><ClearingSimulator /></div>
      <BotRaceDemo />
      <ComparisonSection />
      <PrivacySection />
      <section className="mt-24">
        <Reveal><SectionHeading eyebrow="Costs" title="Know what you pay before you bid." /></Reveal>
        <Reveal className="mt-8"><CostsPanel /></Reveal>
      </section>
      <FaqSection />
      <RiskNotice />
      <TeamsCta />
    </div>
  );
}
