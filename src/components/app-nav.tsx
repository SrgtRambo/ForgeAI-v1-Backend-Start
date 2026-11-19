import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "@/lib/api";

export function AppNav() {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-lg">Forge AI</Link>
          <Link to="/studio" className="text-sm text-muted-foreground hover:text-foreground">Studio</Link>
          <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">Projects</Link>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-muted-foreground">{user.name || user.email}</span>}
          <Link to="/account" className="text-sm text-muted-foreground hover:text-foreground">Account</Link>
        </div>
      </div>
    </nav>
  );
}
