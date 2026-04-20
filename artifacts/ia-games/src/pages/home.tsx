import { useGetAnalyticsSummary, useGetFeaturedDatasets, useGetRecentActivity } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Gamepad2, Users, Database, Zap, Activity, Trophy, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

const levelColors: Record<string, string> = {
  expert: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10",
  pro: "text-primary border-primary/50 bg-primary/10",
  base: "text-muted-foreground border-border bg-muted/20",
};

export default function Home() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetAnalyticsSummary();
  const { data: featured, isLoading: featuredLoading } = useGetFeaturedDatasets();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ query: { limit: 5 } });

  return (
    <Layout>
      <div className="p-4 space-y-5">
        {/* User welcome card */}
        {user && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
            <CardContent className="p-4 flex items-center gap-4 relative">
              <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center text-2xl font-black text-primary flex-shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-lg truncate">{user.username}</p>
                  <Badge variant="outline" className={cn("text-[9px]", levelColors[user.level])}>
                    {user.level.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-secondary font-bold">{user.points.toLocaleString()} pts</span>
                  <span className="text-xs text-muted-foreground">{user.xp} XP</span>
                  <span className="text-xs text-yellow-400">🔥 {user.streak}d streak</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hero */}
        <section className="text-center py-6 space-y-4 relative overflow-hidden rounded-2xl border border-primary/20 bg-card">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-primary via-accent to-secondary text-transparent bg-clip-text">
            IA GAMES ULTIMATE
          </h1>
          <p className="text-sm text-muted-foreground px-6">
            Etichetta dati AI · Guadagna punti · Converti in TON crypto
          </p>
          <Link href="/tasks">
            <Button size="lg" className="w-48 font-black text-base shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_35px_rgba(168,85,247,0.6)] active:scale-95 transition-all">
              <Gamepad2 className="mr-2 h-5 w-5" />
              GIOCA ORA
            </Button>
          </Link>
        </section>

        {/* Platform stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-3 flex items-center gap-3">
              <Users className="h-5 w-5 text-secondary flex-shrink-0" />
              <div>
                {statsLoading ? <Skeleton className="h-5 w-12" /> : <p className="text-lg font-black">{stats?.totalUsers.toLocaleString()}</p>}
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Giocatori</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-3 flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                {statsLoading ? <Skeleton className="h-5 w-12" /> : <p className="text-lg font-black">{stats?.tasksCompletedToday.toLocaleString()}</p>}
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Oggi</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-2">
          <Link href="/leaderboard">
            <Card className="hover-elevate cursor-pointer bg-yellow-400/5 border-yellow-400/20 hover:border-yellow-400/40 transition-all">
              <CardContent className="p-3 text-center">
                <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase">Classifica</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/datasets">
            <Card className="hover-elevate cursor-pointer bg-accent/5 border-accent/20 hover:border-accent/40 transition-all">
              <CardContent className="p-3 text-center">
                <Database className="w-5 h-5 text-accent mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase">Dataset</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={user ? `/profile/${user.id}` : "#"}>
            <Card className="hover-elevate cursor-pointer bg-secondary/5 border-secondary/20 hover:border-secondary/40 transition-all">
              <CardContent className="p-3 text-center">
                <TrendingUp className="w-5 h-5 text-secondary mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase">Statistiche</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Featured datasets */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-primary" />
              Dataset in evidenza
            </h2>
            <Link href="/datasets">
              <Button variant="link" size="sm" className="text-xs text-primary p-0 h-auto font-bold">Vedi tutti →</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {featuredLoading
              ? Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              : featured?.map((dataset) => (
                <Link key={dataset.id} href={`/datasets/${dataset.id}`}>
                  <Card className="hover-elevate cursor-pointer border-border/40 bg-card/60 hover:border-primary/40 transition-all">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{dataset.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{dataset.description}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <Badge variant="outline" className={cn("text-[9px] mb-1",
                          dataset.accessType === "free" ? "text-secondary border-secondary/40 bg-secondary/10" :
                          dataset.accessType === "ads" ? "text-accent border-accent/40 bg-accent/10" :
                          "text-primary border-primary/40 bg-primary/10"
                        )}>
                          {dataset.accessType === "free" ? "Gratis" : dataset.accessType === "ads" ? "Ads" : "Premium"}
                        </Badge>
                        <p className="text-[10px] text-secondary font-bold">{dataset.qualityScore}%</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </section>

        {/* Live feed */}
        <section className="space-y-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-secondary" />
            Feed live
          </h2>
          <Card className="bg-card/30 border-border/30 overflow-hidden">
            <CardContent className="p-0 divide-y divide-border/20">
              {activityLoading
                ? Array(3).fill(0).map((_, i) => <div key={i} className="p-3"><Skeleton className="h-3.5 w-3/4" /></div>)
                : activity?.map((event) => (
                  <div key={event.id} className="p-2.5 flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary/60 mt-1 flex-shrink-0" />
                    <span className="text-muted-foreground leading-relaxed">{event.description}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
