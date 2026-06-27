import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, LayoutDashboard, LogIn, LogOut, Menu, User, X, Zap } from "lucide-react";
import { useState } from "react";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";

const links = [
  { href: "/catalog", label: "Dataset Catalog" },
  { href: "/pricing", label: "Pricing" },
];

export default function Nav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { client, logout } = useBusinessAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PUTITUP" className="h-8 w-8 object-contain [mix-blend-mode:screen]" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            PUTITUP<span className="text-primary"> Business</span>
          </span>
          <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
            Enterprise
          </Badge>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === l.href ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {client ? (
            <>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span className="font-medium text-foreground">{client.name}</span>
              </span>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-destructive"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Log In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="gap-2">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          className="flex items-center justify-center rounded-md p-2 text-muted-foreground md:hidden"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-card px-6 pb-4 md:hidden">
          <nav className="flex flex-col gap-3 pt-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {client ? (
                <>
                  <p className="text-xs text-muted-foreground px-1">Logged in as <span className="font-bold text-foreground">{client.name}</span></p>
                  <Link href="/dashboard" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-2 text-muted-foreground"
                    onClick={() => { logout(); setOpen(false); }}
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      <LogIn className="h-4 w-4" />
                      Log In
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)}>
                    <Button size="sm" className="w-full">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
