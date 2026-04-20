import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Gamepad2, LayoutDashboard, Trophy, Database, User, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetUser } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Using a hardcoded user ID 1 for demo purposes
  const { data: user } = useGetUser(1, { query: { enabled: true } });

  const navItems = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: Gamepad2 },
    { href: "/leaderboard", label: "Rankings", icon: Trophy },
    { href: "/datasets", label: "Datasets", icon: Database },
    { href: "/profile/1", label: "Profile", icon: User },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground w-full max-w-[480px] mx-auto relative border-x border-border shadow-2xl">
      {/* Mobile-first app shell */}
      <div className="flex flex-col w-full">
        {/* Header */}
        <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg tracking-tight uppercase">IA Games</span>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary/10 border border-secondary/20">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="text-xs font-bold text-secondary">{user.points}</span>
              </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 pb-20 overflow-y-auto">
          {children}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 w-full max-w-[480px] bg-background/90 backdrop-blur-md border-t border-border z-50">
          <div className="flex items-center justify-around p-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center w-16 h-14 gap-1 rounded-xl transition-all duration-200",
                    isActive 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
