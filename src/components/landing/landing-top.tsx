import { Link } from "@tanstack/react-router";
import {
  Accessibility,
  ArrowRight,
  Code2,
  FileArchive,
  Gift,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  Download,
} from "lucide-react";
import type { ReactNode } from "react";

import { FREE_ANALYSES_PER_DAY } from "@/lib/landing-pricing";

export function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="reveal mx-auto mb-12 max-w-2xl text-center md:mb-16">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary-glow">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-base text-muted-foreground md:text-lg">{sub}</p>}
    </div>
  );
}

/* ---------------- Hero ---------------- */

export function Hero() {
  const badges = [
    { icon: Code2, label: "No coding required" },
    { icon: Accessibility, label: "WCAG accessible" },
    { icon: FileArchive, label: "Download as ZIP" },
  ];
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-mesh absolute -left-1/4 -top-1/3 h-[70vh] w-[70vh] rounded-full bg-primary/30 blur-[120px]" />
        <div className="animate-mesh-slow absolute -right-1/4 top-0 h-[60vh] w-[60vh] rounded-full bg-primary-glow/25 blur-[120px]" />
        <div className="animate-mesh absolute bottom-[-30%] left-1/3 h-[50vh] w-[50vh] rounded-full bg-primary-glow/15 blur-[100px]" />
        <div className="absolute inset-0 grid-lines [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="mx-auto flex max-w-4xl flex-col items-center px-5 pb-24 pt-20 text-center md:pb-32 md:pt-32">
        <span className="animate-rise mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
          AI website generation for small businesses
        </span>
        <h1 className="animate-rise text-4xl font-bold leading-[1.05] tracking-tight text-foreground [animation-delay:80ms] sm:text-5xl md:text-7xl">
          Your business, online in <span className="text-accent-gradient">60 seconds</span>
        </h1>
        <p className="animate-rise mt-6 max-w-2xl text-base text-muted-foreground [animation-delay:160ms] md:text-xl">
          Forge AI analyzes your business, designs a custom website, and delivers a
          production-ready zip file — no coding required.
        </p>
        <div className="animate-rise mt-10 flex w-full flex-col gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
          <Link
            to="/studio"
            className="glow-hover inline-flex items-center justify-center gap-2 rounded-xl bg-accent-gradient px-7 py-3.5 text-base font-semibold text-primary-foreground"
          >
            Start Building <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#examples"
            className="glow-hover inline-flex items-center justify-center rounded-xl border border-border bg-surface/60 px-7 py-3.5 text-base font-semibold text-foreground hover:border-primary-glow/60"
          >
            See Examples
          </a>
        </div>
        <ul className="animate-rise mt-10 flex flex-wrap justify-center gap-2 [animation-delay:320ms]">
          {badges.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5 text-primary-glow" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- How it works ---------------- */

export function HowItWorks() {
  const steps = [
    {
      icon: MessageSquareText,
      title: "Describe Your Business",
      text: "Tell us what you do, who your customers are, and what you need.",
    },
    {
      icon: Sparkles,
      title: "AI Designs Your Site",
      text: "Our AI analyzes your business, picks the right sections, and writes professional copy.",
    },
    {
      icon: Download,
      title: "Download & Launch",
      text: "Get a production-ready zip with HTML, CSS, images, and README. Host anywhere.",
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps to a finished site"
          sub="From a plain-English description to files you can put online today."
        />
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          <div
            aria-hidden
            className="absolute left-7 top-7 bottom-7 w-px bg-gradient-to-b from-primary/60 via-primary-glow/40 to-transparent md:left-[16.66%] md:right-[16.66%] md:top-7 md:bottom-auto md:h-px md:w-auto md:bg-gradient-to-r"
          />
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="reveal relative flex gap-5 md:flex-col md:items-center md:text-center"
            >
              <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface shadow-[var(--shadow-accent)]">
                <Icon className="h-6 w-6 text-primary-glow" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground md:mt-6">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:mx-auto md:max-w-xs">
                  {text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- Features ---------------- */

export function Features() {
  const features = [
    {
      icon: LayoutGrid,
      title: "16 Section Types",
      text: "Hero, features, testimonials, booking, gallery, team, pricing, FAQ, and more.",
    },
    {
      icon: PenLine,
      title: "AI-Powered Copy",
      text: "Specific, professional copy with zero banned phrases.",
    },
    {
      icon: ImageIcon,
      title: "Stock Imagery",
      text: "Unsplash photos with photographer attribution, automatically matched to your business.",
    },
    {
      icon: ShieldCheck,
      title: "QA Tested",
      text: "Every site passes accessibility (axe-core), contrast, and overflow checks.",
    },
    {
      icon: FileArchive,
      title: "Download as ZIP",
      text: "Complete static site with HTML, CSS, JS, images, README, and sitemap.",
    },
    {
      icon: Gift,
      title: "Free Tier",
      text: `${FREE_ANALYSES_PER_DAY} free analyses per day, no credit card required.`,
    },
  ];
  return (
    <section id="features" className="scroll-mt-20 border-y border-border/60 bg-surface/30 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Features"
          title="Everything a small business site needs"
          sub="Built-in design, copy, imagery and quality checks — no plugins, no page builder."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="reveal glow-hover group rounded-2xl border border-border bg-card p-6 hover:border-primary-glow/50"
            >
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-gradient text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Examples ---------------- */

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="ml-2 flex-1 truncate rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
          {url}
        </span>
      </div>
      <div className="aspect-[4/3]">{children}</div>
    </div>
  );
}

function SushiMock() {
  return (
    <div className="flex h-full flex-col bg-ex-sushi-soft p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold text-ex-sushi">Kaiyō Sushi</span>
        <span className="rounded-full bg-ex-sushi px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
          Book a table
        </span>
      </div>
      <div className="mt-4 h-1/3 rounded-lg bg-gradient-to-br from-ex-sushi/80 to-ex-sushi/40" />
      <div className="mt-3 grid flex-1 grid-cols-3 gap-2">
        {["Nigiri", "Maki", "Sashimi"].map((m) => (
          <div key={m} className="flex flex-col justify-end rounded-md bg-ex-sushi/10 p-1.5">
            <div className="mb-1 h-2/3 rounded bg-ex-sushi/25" />
            <span className="text-[9px] font-semibold text-ex-sushi">{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlumbingMock() {
  return (
    <div className="flex h-full flex-col bg-ex-plumb-soft p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold text-ex-plumb">Rapid Flow Plumbing</span>
        <span className="text-[9px] font-semibold text-ex-plumb">24/7 · Call now</span>
      </div>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-5/6 rounded bg-ex-plumb/70" />
          <div className="h-3 w-2/3 rounded bg-ex-plumb/70" />
          <div className="mt-1 h-1.5 w-full rounded bg-ex-plumb/20" />
          <div className="h-1.5 w-4/5 rounded bg-ex-plumb/20" />
          <div className="mt-auto rounded-md border border-ex-plumb/30 p-1.5 text-[8px] italic text-ex-plumb">
            “Fixed our leak in an hour.” ★★★★★
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg bg-ex-plumb/10 p-2">
          <span className="text-[9px] font-semibold text-ex-plumb">Get a quote</span>
          <div className="h-3 rounded bg-ex-plumb-soft" />
          <div className="h-3 rounded bg-ex-plumb-soft" />
          <div className="h-6 rounded bg-ex-plumb-soft" />
          <div className="mt-auto h-4 rounded bg-ex-plumb" />
        </div>
      </div>
    </div>
  );
}

function BoutiqueMock() {
  return (
    <div className="flex h-full flex-col bg-ex-boutique-soft p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold tracking-[0.2em] text-ex-boutique">
          MAISON LUNE
        </span>
        <span className="text-[9px] text-ex-boutique">Shop · Lookbook</span>
      </div>
      <div className="mt-4 grid flex-1 grid-cols-3 grid-rows-2 gap-2">
        <div className="row-span-2 rounded-md bg-ex-boutique/50" />
        <div className="rounded-md bg-ex-boutique/25" />
        <div className="rounded-md bg-ex-boutique/35" />
        <div className="col-span-2 flex items-end rounded-md bg-ex-boutique/15 p-1.5">
          <span className="text-[9px] font-semibold text-ex-boutique">New autumn collection →</span>
        </div>
      </div>
    </div>
  );
}

export function Examples() {
  const examples = [
    {
      name: "Sushi Restaurant",
      text: "A clean, appetizing restaurant site with menu and booking.",
      url: "kaiyo-sushi.com",
      mock: <SushiMock />,
    },
    {
      name: "Plumbing Service",
      text: "Professional service site with contact form and testimonials.",
      url: "rapidflowplumbing.com",
      mock: <PlumbingMock />,
    },
    {
      name: "Boutique Clothing",
      text: "Elegant retail site with gallery and product showcase.",
      url: "maisonlune.shop",
      mock: <BoutiqueMock />,
    },
  ];
  return (
    <section id="examples" className="scroll-mt-20 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Examples"
          title="Made for real businesses"
          sub="Each site gets its own layout, colors and copy — not the same template with a new logo."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {examples.map((ex) => (
            <article key={ex.name} className="reveal glow-hover rounded-2xl border border-border bg-card p-3">
              <BrowserFrame url={ex.url}>{ex.mock}</BrowserFrame>
              <div className="px-2 pb-2 pt-4">
                <h3 className="text-lg font-semibold text-foreground">{ex.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{ex.text}</p>
                <Link
                  to="/studio"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary-glow/60 hover:text-primary-glow"
                >
                  View example <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
