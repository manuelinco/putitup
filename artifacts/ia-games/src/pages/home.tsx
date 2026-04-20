import { useGetAnalyticsSummary, useGetFeaturedDatasets, useGetRecentActivity } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Gamepad2, Users, Database, Zap, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetAnalyticsSummary();
  const { data: featured, isLoading: featuredLoading } = useGetFeaturedDatasets();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ query: { limit: 5 } });

  return (
    <Layout>
      <div className="p-4 space-y-6">
        <section className="text-center py-8 space-y-4 relative overflow-hidden rounded-2xl border border-primary/20 bg-card">
          <div className="absolute inset-0 bg-primary/5 blur-[100px] pointer-events-none" />
          <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-primary to-secondary text-transparent bg-clip-text">
            IA GAMES ULTIMATE
          </h1>
          <p className="text-sm text-muted-foreground px-4">
            Label data. Earn crypto. Dominate the leaderboard.
          </p>
          <div className="pt-2">
            <Link href="/tasks">
              <Button size="lg" className="w-48 font-bold text-lg shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] active:scale-95">
                <Gamepad2 className="mr-2 h-5 w-5" />
                PLAY NOW
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
              <Users className="h-5 w-5 text-secondary mb-1" />
              {statsLoading ? <Skeleton className="h-6 w-16" /> : <span className="text-xl font-bold">{stats?.totalUsers.toLocaleString()}</span>}
              <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Players</span>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
              <Zap className="h-5 w-5 text-primary mb-1" />
              {statsLoading ? <Skeleton className="h-6 w-16" /> : <span className="text-xl font-bold">{stats?.totalTasks.toLocaleString()}</span>}
              <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Tasks Done</span>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Featured Datasets
            </h2>
            <Link href="/datasets">
              <Button variant="link" size="sm" className="text-xs text-primary p-0 h-auto">View All</Button>
            </Link>
          </div>
          
          <div className="grid gap-3">
            {featuredLoading ? (
              Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : featured?.map((dataset) => (
              <Link key={dataset.id} href={`/datasets/${dataset.id}`}>
                <Card className="hover-elevate cursor-pointer border-border/50 bg-card/50 transition-colors hover:border-primary/50">
                  <CardHeader className="p-3 pb-2 flex flex-row items-start justify-between space-y-0">
                    <CardTitle className="text-sm font-bold">{dataset.name}</CardTitle>
                    <Badge variant={dataset.accessType === 'free' ? 'secondary' : 'default'} className="text-[9px] uppercase">
                      {dataset.accessType}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-1">{dataset.description}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {dataset.downloadCount}</span>
                      <span>•</span>
                      <span>Score: {dataset.qualityScore}%</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-secondary" />
            Live Feed
          </h2>
          <Card className="bg-card/30 border-border/30 overflow-hidden">
            <CardContent className="p-0 divide-y divide-border/20">
              {activityLoading ? (
                Array(3).fill(0).map((_, i) => <div key={i} className="p-3"><Skeleton className="h-4 w-3/4" /></div>)
              ) : activity?.map((event) => (
                <div key={event.id} className="p-3 flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-secondary/50" />
                  <span className="font-bold text-primary">{event.username}</span>
                  <span className="text-muted-foreground text-xs">{event.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

      </div>
    </Layout>
  );
}
