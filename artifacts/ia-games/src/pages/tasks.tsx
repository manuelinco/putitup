import { useState, useEffect } from "react";
import { useGetNextTask, useSubmitResponse, useGetUser, useGetUserStats, useWatchAd, getGetUserStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Timer, Target, Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_USER_ID = 1;

const difficultyColors: Record<string, string> = {
  easy: "text-secondary border-secondary/40 bg-secondary/10",
  medium: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  hard: "text-destructive border-destructive/40 bg-destructive/10",
};

export default function Tasks() {
  const queryClient = useQueryClient();
  const { data: user } = useGetUser(DEMO_USER_ID);
  const { data: stats, refetch: refetchStats } = useGetUserStats(DEMO_USER_ID);
  const { data: task, refetch: refetchTask, isLoading } = useGetNextTask(
    { userId: DEMO_USER_ID },
    { query: { enabled: true } }
  );

  const submitResponse = useSubmitResponse();
  const watchAd = useWatchAd();

  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; points: number; xp: number } | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [showReward, setShowReward] = useState(false);

  useEffect(() => {
    setStartTime(Date.now());
    setSelected(null);
    setSubmitted(false);
    setResult(null);
    setShowReward(false);
  }, [task?.id]);

  const handleSubmit = async () => {
    if (!selected || !task) return;
    const responseTimeMs = Date.now() - startTime;
    try {
      const res = await submitResponse.mutateAsync({
        data: { userId: DEMO_USER_ID, taskId: task.id, answer: selected, responseTimeMs },
      });
      setResult({
        correct: res.response.isCorrect ?? false,
        points: res.pointsEarned,
        xp: res.xpEarned,
      });
      setSubmitted(true);
      setShowReward(true);
      setTimeout(() => setShowReward(false), 2000);
      refetchStats();
      queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(DEMO_USER_ID) });
    } catch {
    }
  };

  const handleNext = () => {
    refetchTask();
  };

  const handleWatchAd = async () => {
    await watchAd.mutateAsync({ data: { userId: DEMO_USER_ID, adType: "rewarded" } });
    refetchStats();
  };

  const payload = task?.dataPayload as Record<string, unknown> | undefined;
  const options = payload?.options as string[] | undefined;
  const energy = stats?.energy ?? user?.energy ?? 100;
  const maxEnergy = stats?.maxEnergy ?? user?.maxEnergy ?? 100;
  const energyPct = (energy / maxEnergy) * 100;

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap className="w-3 h-3 text-secondary" />
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Energy</span>
              </div>
              <div className="text-sm font-bold">{energy}/{maxEnergy}</div>
              <Progress value={energyPct} className="h-1 mt-1" />
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Star className="w-3 h-3 text-primary" />
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Streak</span>
              </div>
              <div className="text-sm font-bold">{stats?.currentStreak ?? 0}d</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Target className="w-3 h-3 text-accent" />
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Accuracy</span>
              </div>
              <div className="text-sm font-bold">{stats?.accuracyRate?.toFixed(0) ?? 0}%</div>
            </CardContent>
          </Card>
        </div>

        {/* XP Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">{user?.level ?? "base"} Level</span>
            <span>{stats?.xp ?? 0} XP</span>
          </div>
          <Progress value={((stats?.xp ?? 0) % 500) / 5} className="h-1.5" />
        </div>

        {/* Low energy warning */}
        {energy < 20 && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-destructive">Low Energy!</p>
                <p className="text-[10px] text-muted-foreground">Watch an ad to recharge</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-destructive/40 text-destructive"
                onClick={handleWatchAd}
                disabled={watchAd.isPending}
              >
                Watch Ad
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Task Card */}
        {isLoading ? (
          <Card className="border-border/50">
            <CardContent className="p-4 space-y-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-40 w-full" />
              <div className="grid grid-cols-2 gap-2">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            </CardContent>
          </Card>
        ) : !task ? (
          <Card className="border-border/50 text-center">
            <CardContent className="p-8 space-y-3">
              <Target className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="font-bold">No tasks available</p>
              <p className="text-xs text-muted-foreground">All tasks completed. Check back soon!</p>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(
            "border transition-all duration-300",
            submitted && result?.correct ? "border-secondary/60 bg-secondary/5" : 
            submitted && !result?.correct ? "border-destructive/60 bg-destructive/5" : 
            "border-border/50"
          )}>
            <CardContent className="p-4 space-y-4">
              {/* Task header */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={cn("text-[10px] uppercase", difficultyColors[task.difficulty])}>
                  {task.difficulty}
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                    {task.type}
                  </Badge>
                  <span className="text-xs text-primary font-bold">+{task.pointsReward}pts</span>
                </div>
              </div>

              {/* Image task */}
              {task.type === "image" && payload?.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border/50">
                  <img 
                    src={payload.imageUrl as string} 
                    alt="Task" 
                    className="w-full h-48 object-cover"
                  />
                </div>
              )}

              {/* Question */}
              <p className="text-sm font-semibold leading-snug">
                {payload?.question as string ?? "Label this item:"}
              </p>

              {/* Text task */}
              {task.type === "text" && payload?.text && (
                <Card className="bg-muted/30 border-border/40">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground italic">"{payload.text as string}"</p>
                  </CardContent>
                </Card>
              )}

              {/* Options */}
              {options && (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      disabled={submitted}
                      onClick={() => !submitted && setSelected(opt)}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-semibold transition-all duration-200 text-left",
                        selected === opt && !submitted 
                          ? "border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                          : submitted && opt === (task.dataPayload as any)?.correctAnswer
                          ? "border-secondary bg-secondary/20 text-secondary"
                          : submitted && selected === opt && opt !== (task.dataPayload as any)?.correctAnswer
                          ? "border-destructive bg-destructive/20 text-destructive"
                          : "border-border/50 hover:border-primary/40 hover:bg-primary/5"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Reward popup */}
              {showReward && result && (
                <div className={cn(
                  "text-center py-2 rounded-xl font-bold text-sm animate-in fade-in slide-in-from-bottom-2",
                  result.correct ? "bg-secondary/20 text-secondary" : "bg-destructive/20 text-destructive"
                )}>
                  {result.correct ? `+${result.points} pts  +${result.xp} XP` : "Incorrect — try the next one!"}
                </div>
              )}

              {/* Submit / Next */}
              {!submitted ? (
                <Button
                  className="w-full font-bold"
                  disabled={!selected || submitResponse.isPending}
                  onClick={handleSubmit}
                >
                  {submitResponse.isPending ? "Submitting..." : "Submit Answer"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  className="w-full font-bold"
                  variant="outline"
                  onClick={handleNext}
                >
                  Next Task
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
