import { Link } from "wouter";
import { Zap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-1 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                PUTITUP<span className="text-primary"> Business</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Human-in-the-loop validated AI training datasets. Built for enterprises that need quality data at scale.
            </p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">Platform</p>
            <ul className="space-y-2">
              <li><Link href="/catalog" className="text-sm text-muted-foreground hover:text-primary transition-colors">Dataset Catalog</Link></li>
              <li><Link href="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors">Pricing</Link></li>
              <li><Link href="/register" className="text-sm text-muted-foreground hover:text-primary transition-colors">Create Account</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">Legal</p>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><a href="mailto:legal@putitupbusiness.it" className="text-sm text-muted-foreground hover:text-primary transition-colors">Legal Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} PUTITUP. All rights reserved. Human-validated datasets powered by crowd intelligence.
        </div>
      </div>
    </footer>
  );
}
