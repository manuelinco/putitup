import { Link, useLocation } from "wouter";
import { Gamepad2, LayoutDashboard, Trophy, User, Zap, Settings, Eye, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const navItems = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: Gamepad2 },
    { href: "/leaderboard", label: "Top", icon: Trophy },
    { href: "/upload", label: "Upload", icon: Upload },
    { href: user ? `/profile/${user.id}` : "/profile/setup", label: "Profile", icon: User },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground w-full max-w-[480px] mx-auto relative border-x border-border/30 shadow-2xl">
      <div className="flex flex-col w-full">
        {/* Header */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Zap className="w-5 h-5 text-primary drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            </div>
            <span className="font-black text-base tracking-tight uppercase bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              PUTITUP
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                <span className="text-xs font-black text-secondary">{user.points.toLocaleString()}</span>
                <span className="text-[9px] text-muted-foreground">pts</span>
              </div>
              {user.isAdmin && (
                <Link href="/controller">
                  <button className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-colors" title="Review Queue">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                  </button>
                </Link>
              )}
              {user.isAdmin && (
                <Link href="/admin">
                  <button className="p-1.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors" title="Admin">
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </Link>
              )}
            </div>
          )}
        </header>

        {/* Main */}
        <main className="flex-1 pb-20 overflow-y-auto">
          {children}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 w-full max-w-[480px] bg-background/95 backdrop-blur-md border-t border-border/30 z-50">
          <div className="flex items-center justify-around py-1.5 px-2">
            {navItems.map((item) => {
              const isActive = item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center w-14 h-12 gap-0.5 rounded-xl transition-all duration-200 relative",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20" />
                  )}
                  <Icon className={cn(
                    "w-4.5 h-4.5 relative",
                    isActive && "drop-shadow-[0_0_6px_rgba(168,85,247,0.9)]"
                  )} />
                  <span className="text-[9px] font-bold uppercase tracking-wide relative">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
