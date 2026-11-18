import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Star } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FREE_ANALYSES_PER_DAY, LANDING_PLANS, formatPlanPrice } from "@/lib/landing-pricing";
import { cn } from "@/lib/utils";

import { LandingLogo } from "./landing-nav";
import { SectionHeading } from "./landing-top";

/* ---------------- Pricing ---------------- */

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-border/60 bg-surface/30 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Pricing"
          title="Pay per site, not per month"
          sub="Try it free. Pay only when you download a site you love."
        />
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {LANDING_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={cn(
                "reveal relative flex flex-col rounded-2xl border bg-card p-7",
                plan.highlighted
                  ? "border-primary-glow/70 shadow-[var(--shadow-accent)] md:-my-3 md:py-10"
                  : "border-border",
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-gradient px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Recommended
                </span>
              )}
              <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold tracking-tight text-foreground">
                  {formatPlanPrice(plan.price)}
                </span>
                <span className="text-sm text-muted-foreground">{plan.unit}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/studio"
                className={cn(
                  "glow-hover mt-8 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
                  plan.highlighted
                    ? "bg-accent-gradient text-primary-foreground"
                    : "border border-border bg-surface text-foreground hover:border-primary-glow/60",
                )}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Testimonials ---------------- */

export function Testimonials() {
  const quotes = [
    {
      quote:
        "I'd put off a website for three years. Forge AI gave me one in an afternoon, and my booking requests doubled the first month.",
      name: "Maria Delgado",
      role: "Owner, Delgado Family Bakery",
    },
    {
      quote:
        "The copy actually sounds like us. I changed two sentences, uploaded the ZIP to my host, and was live before lunch.",
      name: "Tom Becker",
      role: "Becker Roofing & Gutters",
    },
    {
      quote:
        "I was quoted $3,000 by an agency. This cost me less than a lunch and passed every accessibility check.",
      name: "Aisha Rahman",
      role: "Founder, Bloom Yoga Studio",
    },
  ];
  return (
    <section className="px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Testimonials" title="Small businesses, big time savings" />
        <div className="grid gap-6 md:grid-cols-3">
          {quotes.map((q) => (
            <figure key={q.name} className="reveal glow-hover flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-star text-star" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                “{q.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-gradient text-sm font-semibold text-primary-foreground">
                  {q.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{q.name}</span>
                  <span className="block text-xs text-muted-foreground">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

export function Faq() {
  const faqs = [
    {
      q: "How does Forge AI work?",
      a: "AI analyzes your business and generates a complete website spec, then renders it to static HTML/CSS/JS files.",
    },
    {
      q: "Do I need to know how to code?",
      a: "No. You describe your business in plain English and Forge AI handles everything.",
    },
    {
      q: "What do I get?",
      a: "A downloadable ZIP with all HTML, CSS, JavaScript, images, README, and sitemap files. Host anywhere.",
    },
    {
      q: "Can I edit the generated site?",
      a: "Yes. The ZIP contains standard HTML/CSS/JS files you can edit in any editor.",
    },
    {
      q: "Is there a free tier?",
      a: `Yes. ${FREE_ANALYSES_PER_DAY} free analyses per day with no credit card required.`,
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <Accordion type="single" collapsible className="reveal rounded-2xl border border-border bg-card px-6">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`} className={i === faqs.length - 1 ? "border-b-0" : ""}>
              <AccordionTrigger className="py-5 text-base text-foreground hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */

export function FinalCta() {
  return (
    <section className="px-5 pb-24 md:pb-32">
      <div className="reveal relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary-glow/40 bg-surface px-6 py-16 text-center md:py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          <div className="animate-mesh absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/30 blur-[90px]" />
          <div className="animate-mesh-slow absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-primary-glow/30 blur-[90px]" />
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Ready to forge your website?
          </h2>
          <Link
            to="/studio"
            className="glow-hover mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-gradient px-7 py-3.5 text-base font-semibold text-primary-foreground"
          >
            Start Building for Free <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required. {FREE_ANALYSES_PER_DAY} free analyses per day.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */

export function LandingFooter() {
  const linkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <footer className="border-t border-border/60 px-5 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <LandingLogo />
          <p className="mt-3 text-sm text-muted-foreground">
            Forge AI — Build software your business is missing.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3">
          <a href="#features" className={linkClass}>Features</a>
          <a href="#pricing" className={linkClass}>Pricing</a>
          <a href="#how-it-works" className={linkClass}>How It Works</a>
          <Link to="/auth" className={linkClass}>Sign In</Link>
          <Link to="/privacy" className={linkClass}>Privacy</Link>
          <Link to="/terms" className={linkClass}>Terms</Link>
        </nav>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Forge AI</p>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient" />
          Built with Forge AI
        </span>
      </div>
    </footer>
  );
}
