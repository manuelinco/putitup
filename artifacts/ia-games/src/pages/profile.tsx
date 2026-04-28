import { useParams } from "wouter";
import { useState, useEffect } from "react";
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
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Target, Star, Trophy, CheckCircle, TrendingUp, Wallet, LogOut, Flame, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RewardEntry {
  id: number;
  role: string;
  amountTon: number;
  pointsValue: number;
  status: string;
  createdAt: string;
}
interface RewardsData {
  entries: RewardEntry[];
  totalTon: number;
}

const levelBadgeColors: Record<string, string> = {
  expert: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10",
  pro: "text-primary border-primary/50 bg-primary/10",
  base: "text-muted-foreground border-border bg-muted/30",
};

const missionTypeIcons: Record<string, React.ElementType> = {
  tasks: Target,
  accuracy: TrendingUp,
  streak: Flame,
  ads: Zap,
};

export default function Profile() {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id ?? "0", 10);
  const queryClient = useQueryClient();
  const { user: authUser, logout, source, wallet, disconnectWallet, refreshUser } = useAuth();
  const isOwnProfile = authUser?.id === userId;

  const { data: user, isLoading: userLoading } = useGetUser(userId, { query: { enabled: !!userId } });
  const { data: stats, isLoading: statsLoading } = useGetUserStats(userId, { query: { enabled: !!userId } });
  const { data: missions, isLoading: missionsLoading } = useGetDailyMissions(userId, { query: { enabled: !!userId } });
  const { data: adTracking } = useGetAdTracking(userId, { query: { enabled: !!userId } });

  const convertPoints = useConvertPoints();
  const rechargeEnergy = useRechargeEnergy();

  const [rewards, setRewards] = useState<RewardsData | null>(null);
  useEffect(() => {
    if (!isOwnProfile || !userId) return;
    fetch(`${API_BASE}/api/users/${userId}/rewards`)
      .then((r) => r.json())
      .then(setRewards)
      .catch(() => {});
  }, [userId, isOwnProfile]);

  const handleConvert = async () => {
    if (!user || user.points < 1000) return;
    await convertPoints.mutateAsync({ data: { userId, points: 1000 } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
    refreshUser();
  };

  const handleRecharge = async () => {
    await rechargeEnergy.mutateAsync({ data: { userId, method: "ad" } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
    refreshUser();
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

  const xpInLevel = (stats?.xp ?? user.xp ?? 0) % 500;
  const xpProgress = (xpInLevel / 500) * 100;
  const currentPoints = stats?.points ?? user.points;
  const currentEnergy = stats?.energy ?? user.energy;
  const currentMaxEnergy = stats?.maxEnergy ?? user.maxEnergy;

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-6">
        {/* Profile header */}
        <div className="flex items-center gap-4 pt-3">
          <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/60 flex items-center justify-center text-3xl font-black text-primary shadow-[0_0_20px_rgba(168,85,247,0.3)] flex-shrink-0">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black truncate">{user.username}</h1>
            <Badge variant="outline" className={cn("mt-1 text-[10px]", levelBadgeColors[user.level])}>
              {user.level.toUpperCase()} TIER
            </Badge>
            {isOwnProfile && source === "wallet" && wallet && (
              <p className="text-[10px] text-muted-foreground mt-1 font-mono flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                {wallet.account.address.slice(0, 8)}...{wallet.account.address.slice(-6)}
              </p>
            )}
          </div>
          {isOwnProfile && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={logout}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* XP progress */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-bold">Progresso Livello</span>
              <span className="text-muted-foreground">{xpInLevel}/500 XP</span>
            </div>
            <Progress value={xpProgress} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{user.level}</span>
              <span>→ {user.level === "base" ? "pro" : user.level === "pro" ? "expert" : "MAX"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Punti", value: currentPoints.toLocaleString(), icon: Star, color: "text-primary" },
            { label: "Task Completati", value: (stats?.tasksCompleted ?? 0).toLocaleString(), icon: Target, color: "text-secondary" },
            { label: "Precisione", value: `${(stats?.accuracyRate ?? user.score ?? 0).toFixed(1)}%`, icon: TrendingUp, color: "text-accent" },
            { label: "Streak", value: `${stats?.currentStreak ?? user.streak ?? 0}d`, icon: Flame, color: "text-orange-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-card/60 border-border/40">
              <CardContent className="p-3 text-center">
                <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
                <p className="text-lg font-black">{value}</p>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Energy */}
        {isOwnProfile && (
          <Card className="border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-secondary" />
                  <span className="font-bold text-sm">Energia</span>
                </div>
                <span className="text-sm font-bold">{currentEnergy}/{currentMaxEnergy}</span>
              </div>
              <Progress value={(currentEnergy / currentMaxEnergy) * 100} className="h-2" />
              <Button
                variant="outline" size="sm"
                className="w-full text-xs border-secondary/40 text-secondary hover:bg-secondary/10"
                onClick={handleRecharge}
                disabled={rechargeEnergy.isPending || currentEnergy >= currentMaxEnergy}
              >
                <Zap className="w-3 h-3 mr-1" />
                Ricarica con pubblicità (+50)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Daily Missions */}
        <Card className="border-border/50">
          <CardHeader className="p-3 pb-2 border-b border-border/30">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              Missioni Giornaliere
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
                    <div key={mission.id} className={cn("p-3 space-y-1.5", mission.completed && "bg-secondary/5")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {mission.completed
                            ? <CheckCircle className="w-4 h-4 text-secondary flex-shrink-0" />
                            : <MissionIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          }
                          <div>
                            <p className="text-sm font-bold">{mission.title}</p>
                            <p className="text-[10px] text-muted-foreground">{mission.description}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-[9px] flex-shrink-0 ml-2",
                          mission.completed ? "text-secondary border-secondary/40 bg-secondary/10" : "text-muted-foreground"
                        )}>
                          +{mission.reward}pts
                        </Badge>
                      </div>
                      {!mission.completed && (
                        <>
                          <Progress value={(mission.current / mission.target) * 100} className="h-1" />
                          <p className="text-[10px] text-muted-foreground">{mission.current}/{mission.target}</p>
                        </>
                      )}
                    </div>
                  );
                })}
          </CardContent>
        </Card>

        {/* TON conversion */}
        {isOwnProfile && (
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Converti in TON</p>
                  <p className="text-[11px] text-muted-foreground">1.000 pts = 1 TON</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-2xl text-accent">{(Math.floor(currentPoints / 1000)).toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground">TON disponibili</p>
                </div>
              </div>
              <Button
                className="w-full font-bold"
                disabled={currentPoints < 1000 || convertPoints.isPending}
                onClick={handleConvert}
              >
                {convertPoints.isPending ? "Conversione..." : "Converti 1.000 pts → 1 TON"}
              </Button>
              {currentPoints < 1000 && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Ti mancano {(1000 - currentPoints).toLocaleString()} punti
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* TON Reward Ledger */}
        {isOwnProfile && rewards && rewards.entries.length > 0 && (
          <Card className="border-primary/30">
            <CardHeader className="p-3 pb-2 border-b border-border/30">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Coins className="w-3.5 h-3.5 text-primary" />
                  Premi TON Ricevuti
                </span>
                <span className="text-primary font-black text-sm">{rewards.totalTon} TON</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/20 max-h-48 overflow-y-auto">
              {rewards.entries.map((entry) => (
                <div key={entry.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold capitalize">{entry.role}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString("it-IT")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-primary">+{entry.amountTon.toFixed(5)} TON</p>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      entry.status === "approved" ? "text-secondary border-secondary/40" : "text-muted-foreground"
                    )}>
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Ads stats */}
        {isOwnProfile && adTracking && (
          <Card className="border-border/40">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">Pubblicità oggi</p>
                <p className="text-[10px] text-muted-foreground">Limite giornaliero: {adTracking.dailyCap}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black">{adTracking.adsWatchedToday}/{adTracking.dailyCap}</p>
                {adTracking.dailyCapReached && (
                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40">
                    Limite raggiunto
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
