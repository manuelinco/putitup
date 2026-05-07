import { useParams, useLocation } from "wouter";
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
import { AdChallenge } from "@/components/ad-challenge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Target, Star, Trophy, CheckCircle, TrendingUp, Wallet, LogOut, Flame, Coins, Gift, Copy, Users } from "lucide-react";
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
  const [, navigate] = useLocation();
  const rawId = params.id ?? "0";
  const userId = parseInt(rawId, 10);
  const queryClient = useQueryClient();
  const { user: authUser, logout, source, wallet, refreshUser } = useAuth();
  const isOwnProfile = authUser?.id === userId;

  // Redirect "setup" (unauthenticated placeholder) to real profile once logged in
  useEffect(() => {
    if ((rawId === "setup" || isNaN(userId)) && authUser?.id) {
      navigate(`/profile/${authUser.id}`, { replace: true });
    }
  }, [rawId, userId, authUser?.id]);

  const { data: user, isLoading: userLoading } = useGetUser(userId, { query: { enabled: !!userId } as any });
  const { data: stats, isLoading: statsLoading } = useGetUserStats(userId, { query: { enabled: !!userId } as any });
  const { data: missions, isLoading: missionsLoading } = useGetDailyMissions(userId, { query: { enabled: !!userId } as any });
  const { data: adTracking } = useGetAdTracking(userId, { query: { enabled: !!userId } as any });

  const convertPoints = useConvertPoints();
  const rechargeEnergy = useRechargeEnergy();

  const [rewards, setRewards] = useState<RewardsData | null>(null);
  const [showAdChallenge, setShowAdChallenge] = useState(false);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [referralInput, setReferralInput] = useState("");
  const [referralMsg, setReferralMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOwnProfile || !userId) return;
    fetch(`${API_BASE}/api/users/${userId}/rewards`)
      .then((r) => r.json())
      .then(setRewards)
      .catch(() => {});
    fetch(`${API_BASE}/api/referral/stats/${userId}`)
      .then((r) => r.json())
      .then(setReferralStats)
      .catch(() => {});
  }, [userId, isOwnProfile]);

  const handleCopyReferral = () => {
    if (!referralStats?.referralCode) return;
    const link = `https://t.me/putitup_bot?start=${referralStats.referralCode}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyReferral = async () => {
    if (!referralInput) return;
    try {
      const res = await fetch(`${API_BASE}/api/referral/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, referralCode: referralInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      setReferralMsg(`Referral applied! Referred by @${data.referrerUsername}`);
      setReferralInput("");
    } catch (e: any) {
      setReferralMsg(e.message);
    }
    setTimeout(() => setReferralMsg(null), 4000);
  };

  const handleConvert = async () => {
    if (!user || user.points < 1000) return;
    await convertPoints.mutateAsync({ data: { userId, points: 1000 } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
    refreshUser();
  };

  const handleAdComplete = async () => {
    setShowAdChallenge(false);
    await rechargeEnergy.mutateAsync({ data: { userId, method: "ad" } });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
    refreshUser();
  };

  const handleAdFail = () => {
    setShowAdChallenge(false);
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
      {showAdChallenge && (
        <AdChallenge
          onComplete={handleAdComplete}
          onFail={handleAdFail}
          rewardText="+50 Energy"
        />
      )}

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
              <span className="font-bold">Level Progress</span>
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
            { label: "Points", value: currentPoints.toLocaleString(), icon: Star, color: "text-primary" },
            { label: "Tasks Done", value: (stats?.tasksCompleted ?? 0).toLocaleString(), icon: Target, color: "text-secondary" },
            { label: "Accuracy", value: `${(stats?.accuracyRate ?? user.score ?? 0).toFixed(1)}%`, icon: TrendingUp, color: "text-accent" },
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
                  <span className="font-bold text-sm">Energy</span>
                </div>
                <span className="text-sm font-bold">{currentEnergy}/{currentMaxEnergy}</span>
              </div>
              <Progress value={(currentEnergy / currentMaxEnergy) * 100} className="h-2" />
              <Button
                variant="outline" size="sm"
                className="w-full text-xs border-secondary/40 text-secondary hover:bg-secondary/10"
                onClick={() => setShowAdChallenge(true)}
                disabled={rechargeEnergy.isPending || currentEnergy >= currentMaxEnergy}
              >
                <Zap className="w-3 h-3 mr-1" />
                Watch ad to recharge (+50)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Referral Section */}
        {isOwnProfile && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="p-3 pb-2 border-b border-border/30">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Gift className="w-3.5 h-3.5 text-primary" />
                Referral Program
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              {/* Your referral code */}
              {referralStats?.referralCode && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Your referral code</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted/40 border border-border/50 rounded-lg p-2 font-mono text-sm font-black tracking-widest text-primary">
                      {referralStats.referralCode}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary/40 text-primary hover:bg-primary/10 flex-shrink-0"
                      onClick={handleCopyReferral}
                    >
                      {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Share your link and earn <span className="text-primary font-bold">+500 pts</span> for each friend who completes 10 tasks.
                  </p>
                </div>
              )}

              {/* Referral stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card/60 rounded-lg p-2 text-center">
                  <p className="text-xl font-black text-primary">{referralStats?.referralCount ?? 0}</p>
                  <p className="text-[9px] uppercase text-muted-foreground">Friends referred</p>
                </div>
                <div className="bg-card/60 rounded-lg p-2 text-center">
                  <p className="text-xl font-black text-secondary">{referralStats?.referralBonusEarned ?? 0}</p>
                  <p className="text-[9px] uppercase text-muted-foreground">Bonus pts earned</p>
                </div>
              </div>

              {/* Referred users list */}
              {referralStats?.referrals?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Your referrals
                  </p>
                  <div className="divide-y divide-border/20 rounded-lg border border-border/30 overflow-hidden">
                    {referralStats.referrals.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2">
                        <p className="text-xs font-bold">@{r.username}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground">{r.tasksCompleted}/10 tasks</p>
                          {r.bonusEarned && (
                            <Badge variant="outline" className="text-[8px] text-secondary border-secondary/40">
                              +500 pts
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply referral code */}
              {!referralStats?.referredBy && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Apply a referral code</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground font-mono"
                      placeholder="Enter code"
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 text-xs"
                      onClick={handleApplyReferral}
                      disabled={!referralInput}
                    >
                      Apply
                    </Button>
                  </div>
                  {referralMsg && (
                    <p className={cn("text-[10px]", referralMsg.startsWith("Error") || referralMsg.startsWith("User") ? "text-destructive" : "text-secondary")}>
                      {referralMsg}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                  <p className="font-bold text-sm">Convert to TON</p>
                  <p className="text-[11px] text-muted-foreground">1,000 pts = 1 TON</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-2xl text-accent">{(Math.floor(currentPoints / 1000)).toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground">TON available</p>
                </div>
              </div>
              <Button
                className="w-full font-bold"
                disabled={currentPoints < 1000 || convertPoints.isPending}
                onClick={handleConvert}
              >
                {convertPoints.isPending ? "Converting..." : "Convert 1,000 pts → 1 TON"}
              </Button>
              {currentPoints < 1000 && (
                <p className="text-[10px] text-center text-muted-foreground">
                  You need {(1000 - currentPoints).toLocaleString()} more points
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
                  TON Rewards Received
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
                      {new Date(entry.createdAt).toLocaleDateString("en-US")}
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
                <p className="text-sm font-bold">Ads today</p>
                <p className="text-[10px] text-muted-foreground">Daily cap: {adTracking.dailyCap}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black">{adTracking.adsWatchedToday}/{adTracking.dailyCap}</p>
                {adTracking.dailyCapReached && (
                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40">
                    Cap reached
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
