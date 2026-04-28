import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Zap, Trophy, Database, TrendingUp } from "lucide-react";

export function LoginScreen() {
  const { connectWallet, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Zap className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Hero */}
        <div className="text-center space-y-3 py-6">
          <div className="relative inline-block">
            <div className="absolute inset-0 blur-2xl bg-primary/30 rounded-full" />
            <Zap className="relative w-16 h-16 text-primary mx-auto" />
          </div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-br from-primary via-accent to-secondary text-transparent bg-clip-text">
            PUTITUP
          </h1>
          <p className="text-base font-bold text-foreground">Human-in-the-Loop AI Data</p>
          <p className="text-sm text-muted-foreground px-4">
            Label AI data. Earn TON crypto. Power the future of AI.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Trophy, label: "Global Leaderboard", color: "text-yellow-400" },
            { icon: TrendingUp, label: "XP & Levels", color: "text-secondary" },
            { icon: Database, label: "Validated Datasets", color: "text-accent" },
            { icon: Zap, label: "TON Rewards", color: "text-primary" },
          ].map(({ icon: Icon, label, color }) => (
            <Card key={label} className="bg-card/50 border-border/40">
              <CardContent className="p-3 flex items-center gap-2">
                <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                <span className="text-xs font-semibold">{label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Connect */}
        <div className="space-y-3">
          <Button
            className="w-full h-14 text-base font-black shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] transition-all"
            onClick={connectWallet}
          >
            <Wallet className="w-5 h-5 mr-2" />
            Connect TON Wallet
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            Open in Telegram for automatic login.
            <br />
            On web, connect your TON wallet.
          </p>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-center text-muted-foreground opacity-50">
          Powered by TON Blockchain · PUTITUP © 2025
        </p>
      </div>
    </div>
  );
}
