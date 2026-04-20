import { useParams } from "wouter";
import {
  useGetUser,
  useGetUserStats,
  useGetDailyMissions,
  useGetAdTracking,
  useConvertPoints,
  useRechargeEnergy,
  getGetUserStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Target, Star, Trophy, CheckCircle, Circle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const levelBadgeColors: Record<string, string> = {
  expert: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10",
  pro: "text-primary border-primary/50 bg-primary/10",
  base: "text-muted-foreground border-border bg-muted/30",
};

const missionTypeIcons: Record<string, React.ElementType> = {
  tasks: Target,
  accuracy: TrendingUp,
  streak: Star,
  ads: Zap,
};

export default function Profile() {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id ?? "1", 10);
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useGetUser(userId, { query: { enabled: !!userId } });
  const { data: stats, isLoading: statsLoading } = useGetUserStats(userId, { query: { enabled: !!userId } });
  const { data: missions, isLoading: missionsLoading } = useGetDailyMissions(userId, { query: { enabled: !!userId } });
  const { data: adTracking } = useGetAdTracking(userId, { query: { enabled: !!userId } });

  const convertPoints = useConvertPoints();
  const rechargeEnergy = useRechargeEnergy();

  const handleConvert = async () => {
    if (!user || user.points < 1000) return;
    await convertPoints.mutateAsync({ data: { userId, points: 1000 } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
  };

  const handleRecharge = async () => {
    await rechargeEnergy.mutateAsync({ data: { userId, method: "ad" } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
  };

  const isLoading = userLoading || statsLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4 pt-4">
            <Skeleton className="w-20 h-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!user) return null;

  const xpInLevel = (stats?.xp ?? 0) % 500;
  const xpProgress = (xpInLevel / 500) * 100;

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4 pt-4">
          <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/60 flex items-center justify-center text-3xl font-black text-primary shadow-[0_0_20px_rgba(168,85,247,0.3)]">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-black">{user.username}</h1>
            <Badge variant="outline" className={cn("mt-1 text-xs", levelBadgeColors[user.level])}>
              {user.level.toUpperCase()} TIER
            </Badge>
            {user.walletAddress && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate max-w-[180px]">
                {user.walletAddress}
              </p>
            )}
          </div>
        </div>

        {/* XP Progress */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-bold">Level Progress</span>
              <span className="text-muted-foreground">{xpInLevel}/500 XP</span>
            </div>
            <Progress value={xpProgress} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{user.level}</span>
              <span>→ {user.level === "base" ? "pro" : user.level === "pro" ? "expert" : "max"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Points", value: (stats?.points ?? user.points).toLocaleString(), icon: Star, color: "text-primary" },
            { label: "Tasks Done", value: (stats?.tasksCompleted ?? 0).toLocaleString(), icon: Target, color: "text-secondary" },
            { label: "Accuracy", value: `${(stats?.accuracyRate ?? user.score).toFixed(1)}%`, icon: TrendingUp, color: "text-accent" },
            { label: "Streak", value: `${stats?.currentStreak ?? user.streak}d`, icon: Trophy, color: "text-yellow-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-card/50 border-border/50">
              <CardContent className="p-3 text-center">
                <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
                <div className="text-lg font-black">{value}</div>
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Energy */}
        <Card className="border-secondary/30 bg-secondary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-secondary" />
                <span className="font-bold text-sm">Energy</span>
              </div>
              <span className="text-sm font-bold">{stats?.energy ?? user.energy}/{stats?.maxEnergy ?? user.maxEnergy}</span>
            </div>
            <Progress value={((stats?.energy ?? user.energy) / (stats?.maxEnergy ?? user.maxEnergy)) * 100} className="h-2" />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-secondary/40 text-secondary"
              onClick={handleRecharge}
              disabled={rechargeEnergy.isPending || (stats?.energy ?? 0) >= (stats?.maxEnergy ?? 100)}
            >
              Recharge Energy (+50)
            </Button>
          </CardContent>
        </Card>

        {/* Daily Missions */}
        <Card className="border-border/50">
          <CardHeader className="p-3 pb-2 border-b border-border/30">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              Daily Missions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/20">
            {missionsLoading
              ? Array(4).fill(0).map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))
              : missions?.map((mission) => {
                  const MissionIcon = missionTypeIcons[mission.type] ?? Target;
                  return (
                    <div key={mission.id} className={cn("p-3 space-y-2", mission.completed && "bg-secondary/5")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {mission.completed
                            ? <CheckCircle className="w-4 h-4 text-secondary" />
                            : <MissionIcon className="w-4 h-4 text-muted-foreground" />
                          }
                          <div>
                            <p className="text-sm font-bold">{mission.title}</p>
                            <p className="text-[10px] text-muted-foreground">{mission.description}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-[10px]",
                          mission.completed ? "text-secondary border-secondary/40 bg-secondary/10" : "text-muted-foreground"
                        )}>
                          +{mission.reward} pts
                        </Badge>
                      </div>
                      {!mission.completed && (
                        <Progress value={(mission.current / mission.target) * 100} className="h-1.5" />
                      )}
                      {!mission.completed && (
                        <p className="text-[10px] text-muted-foreground">{mission.current}/{mission.target}</p>
                      )}
                    </div>
                  );
                })}
          </CardContent>
        </Card>

        {/* TON Conversion */}
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm">Convert to TON</p>
                <p className="text-[11px] text-muted-foreground">1000 pts = 1 TON</p>
              </div>
              <div className="text-right">
                <p className="font-black text-lg">{(stats?.points ?? user.points).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">pts available</p>
              </div>
            </div>
            <Button
              className="w-full font-bold"
              disabled={(stats?.points ?? user.points) < 1000 || convertPoints.isPending}
              onClick={handleConvert}
            >
              {convertPoints.isPending ? "Converting..." : "Convert 1000 pts → 1 TON"}
            </Button>
            {(stats?.points ?? user.points) < 1000 && (
              <p className="text-[10px] text-center text-muted-foreground">
                Need {1000 - (stats?.points ?? user.points)} more points to convert
              </p>
            )}
          </CardContent>
        </Card>

        {/* Ads Stats */}
        {adTracking && (
          <Card className="border-border/50">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">Ads Today</p>
                <p className="text-[10px] text-muted-foreground">Daily cap: {adTracking.dailyCap}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black">{adTracking.adsWatchedToday}/{adTracking.dailyCap}</p>
                {adTracking.dailyCapReached && (
                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40">Cap Reached</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
