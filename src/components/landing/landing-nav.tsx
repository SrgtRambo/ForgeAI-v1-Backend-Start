import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const SECTIONS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#how-it-works", label: "How It Works" },
];

export function LandingLogo() {
  return (
    <Link to="/" className="font-display text-xl font-bold tracking-tight text-foreground">
      FORGE <span className="text-accent-gradient">AI.</span>
    </Link>
  );
}

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"
      >
        <LandingLogo />

        <div className="hidden items-center gap-8 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
          <Link
            to="/auth"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
          <Link
            to="/studio"
            className="glow-hover rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Get Started
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border/70 bg-background px-5 pb-5 md:hidden">
          <div className="flex flex-col gap-1 pt-3">
            {SECTIONS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                onClick={close}
                className="rounded-lg px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
            <Link
              to="/auth"
              onClick={close}
              className="rounded-lg px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Sign In
            </Link>
            <Link
              to="/studio"
              onClick={close}
              className="glow-hover mt-2 rounded-lg bg-accent-gradient px-4 py-3 text-center text-base font-semibold text-primary-foreground"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
