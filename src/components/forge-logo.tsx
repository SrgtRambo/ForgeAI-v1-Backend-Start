import { Link } from "@tanstack/react-router";

export function ForgeLogo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`font-display text-xl font-bold tracking-tight text-foreground ${className}`}
    >
      FORGE <span className="text-primary">AI.</span>
    </Link>
  );
}
