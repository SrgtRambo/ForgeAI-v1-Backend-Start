import { createFileRoute } from "@tanstack/react-router";

import { Faq, FinalCta, LandingFooter, Pricing, Testimonials } from "@/components/landing/landing-bottom";
import { LandingNav } from "@/components/landing/landing-nav";
import { Examples, Features, Hero, HowItWorks } from "@/components/landing/landing-top";

const TITLE = "Forge AI — Your business website in 60 seconds";
const DESCRIPTION =
  "Forge AI analyzes your business, designs a custom website, and delivers a production-ready ZIP. No coding required. 5 free analyses per day.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing min-h-screen">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Examples />
        <Pricing />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
