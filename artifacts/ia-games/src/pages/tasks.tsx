import { useState, useEffect, useRef } from "react";
import { useGetNextTask, useSubmitResponse, useGetUserStats, useWatchAd, getGetUserStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useTelegramHaptic, useTelegramMainButton } from "@/hooks/useTelegram";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Timer, Target, Star, ChevronRight, Flame, TrendingUp, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const TASK_TIME_SECONDS = 30;

const difficultyConfig: Record<string, { label: string; color: string; points: number }> = {
  easy:   { label: "FACILE", color: "text-secondary border-secondary/40 bg-secondary/10", points: 10 },
  medium: { label: "MEDIO",  color: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", points: 20 },
  hard:   { label: "DIFFICILE", color: "text-destructive border-destructive/40 bg-destructive/10", points: 30 },
};

const typeLabels: Record<string, string> = {
  image: "IMMAGINE",
  text: "TESTO",
  classification: "CLASSIFICAZIONE",
};

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const userId = user?.id ?? 0;
  const { impact, notification } = useTelegramHaptic();

  const { data: stats, refetch: refetchStats } = useGetUserStats(userId, { query: { enabled: !!userId } });
  const { data: task, refetch: refetchTask, isLoading } = useGetNextTask(
    { userId },
    { query: { enabled: !!userId } }
  );

  const submitResponse = useSubmitResponse();
  const watchAd = useWatchAd();

  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; points: number; xp: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TASK_TIME_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [shake, setShake] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [totalToday, setTotalToday] = useState(0);
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!task) return;
    setSelected(null);
    setSubmitted(false);
    setResult(null);
    setTimeLeft(TASK_TIME_SECONDS);
    setTimerActive(true);
    setShake(false);
    setBounce(false);
    startTime.current = Date.now();
  }, [task?.id]);

  useEffect(() => {
    if (!timerActive || submitted) return;
    if (timeLeft <= 0) {
      setTimerActive(false);
      handleAutoSubmit();
      return;
    }
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timerActive, timeLeft, submitted]);

  const handleAutoSubmit = async () => {
    if (!task || submitted) return;
    notification("warning");
    const responseTimeMs = Date.now() - startTime.current;
    await submitResponse.mutateAsync({
      data: { userId, taskId: task.id, answer: selected ?? "", responseTimeMs },
    }).catch(() => {});
    setSubmitted(true);
    setCombo(0);
    setResult({ correct: false, points: 0, xp: 0 });
  };

  const handleSubmit = async () => {
    if (!selected || !task || submitted) return;
    setTimerActive(false);
    impact("medium");
    const responseTimeMs = Date.now() - startTime.current;
    try {
      const res = await submitResponse.mutateAsync({
        data: { userId, taskId: task.id, answer: selected, responseTimeMs },
      });
      const correct = res.response.isCorrect ?? false;
      setResult({ correct, points: res.pointsEarned, xp: res.xpEarned });
      setSubmitted(true);
      if (correct) {
        notification("success");
        setCombo((c) => c + 1);
        setBounce(true);
        setTimeout(() => setBounce(false), 600);
      } else {
        notification("error");
        setCombo(0);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
      setTotalToday((t) => t + 1);
      refetchStats();
      queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
      refreshUser();
    } catch {}
  };

  const handleNext = () => {
    impact("light");
    refetchTask();
  };

  const handleOptionSelect = (opt: string) => {
    if (!submitted) {
      impact("light");
      setSelected(opt);
    }
  };

  const handleWatchAd = async () => {
    await watchAd.mutateAsync({ data: { userId, adType: "rewarded" } });
    refetchStats();
    refreshUser();
  };

  useTelegramMainButton(
    submitted ? "Task successivo ›" : "Conferma risposta",
    submitted ? handleNext : handleSubmit,
    {
      visible: !!task && !isLoading,
      active: submitted ? true : !!selected && !submitResponse.isPending,
    }
  );

  const payload = task?.dataPayload as Record<string, unknown> | undefined;
  const options = payload?.options as string[] | undefined;
  const energy = stats?.energy ?? user?.energy ?? 100;
  const maxEnergy = stats?.maxEnergy ?? user?.maxEnergy ?? 100;
  const energyPct = (energy / maxEnergy) * 100;
  const timerPct = (timeLeft / TASK_TIME_SECONDS) * 100;
  const comboMultiplier = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;

  return (
    <Layout>
      <div className="p-4 space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-card/60 border border-border/40 rounded-xl p-2 text-center">
            <Zap className="w-3 h-3 text-secondary mx-auto mb-0.5" />
            <p className="text-sm font-black">{energy}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Energia</p>
            <Progress value={energyPct} className="h-0.5 mt-1" />
          </div>
          <div className="bg-card/60 border border-border/40 rounded-xl p-2 text-center">
            <Flame className="w-3 h-3 text-orange-400 mx-auto mb-0.5" />
            <p className="text-sm font-black">{stats?.currentStreak ?? 0}d</p>
            <p className="text-[9px] text-muted-foreground uppercase">Streak</p>
          </div>
          <div className="bg-card/60 border border-border/40 rounded-xl p-2 text-center">
            <Target className="w-3 h-3 text-accent mx-auto mb-0.5" />
            <p className="text-sm font-black">{stats?.accuracyRate?.toFixed(0) ?? 0}%</p>
            <p className="text-[9px] text-muted-foreground uppercase">Prec.</p>
          </div>
          <div className={cn(
            "border rounded-xl p-2 text-center transition-all",
            combo >= 3 ? "bg-yellow-400/10 border-yellow-400/40" : "bg-card/60 border-border/40"
          )}>
            <Star className={cn("w-3 h-3 mx-auto mb-0.5", combo >= 3 ? "text-yellow-400" : "text-muted-foreground")} />
            <p className={cn("text-sm font-black", combo >= 3 ? "text-yellow-400" : "")}>
              {combo >= 3 ? `x${comboMultiplier}` : combo}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase">Combo</p>
          </div>
        </div>

        {/* XP bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span className="font-bold uppercase tracking-wider">{user?.level ?? "base"}</span>
            <span>{stats?.xp ?? user?.xp ?? 0} XP · {totalToday} oggi</span>
          </div>
          <Progress value={((stats?.xp ?? user?.xp ?? 0) % 500) / 5} className="h-1" />
        </div>

        {/* Low energy warning */}
        {energy < 20 && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-destructive/40 bg-destructive/10">
            <div>
              <p className="text-xs font-black text-destructive">Energia esaurita!</p>
              <p className="text-[10px] text-muted-foreground">Guarda un annuncio per ricaricare</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-destructive/40 text-destructive h-8"
              onClick={handleWatchAd} disabled={watchAd.isPending}>
              Guarda Ad
            </Button>
          </div>
        )}

        {/* MINI-GAME CARD */}
        {isLoading ? (
          <Card className="border-border/50 min-h-[300px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Caricamento task...</p>
            </div>
          </Card>
        ) : !task ? (
          <Card className="border-border/50 text-center min-h-[200px] flex items-center justify-center">
            <CardContent className="p-8 space-y-3">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="font-black">Nessun task disponibile</p>
              <p className="text-xs text-muted-foreground">Hai completato tutto! Torna presto.</p>
              <Button variant="outline" size="sm" onClick={handleNext}>Riprova</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(
            "border transition-all duration-300",
            submitted && result?.correct
              ? "border-secondary/60 shadow-[0_0_20px_rgba(74,222,128,0.2)]"
              : submitted && !result?.correct
              ? "border-destructive/60 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              : "border-primary/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]",
            shake && "animate-shake",
            bounce && "animate-bounce-once"
          )}>
            <CardContent className="p-4 space-y-4">
              {/* Task header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[9px] uppercase", difficultyConfig[task.difficulty]?.color)}>
                    {difficultyConfig[task.difficulty]?.label}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] text-muted-foreground uppercase">
                    {typeLabels[task.type] ?? task.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {comboMultiplier > 1 && !submitted && (
                    <span className="text-[10px] font-black text-yellow-400">x{comboMultiplier}</span>
                  )}
                  <span className="text-xs font-black text-primary">+{task.pointsReward * comboMultiplier}pts</span>
                </div>
              </div>

              {/* Timer bar */}
              {!submitted && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="w-3 h-3" /> Tempo
                    </span>
                    <span className={cn("font-black", timeLeft <= 10 ? "text-destructive animate-pulse" : "")}>
                      {timeLeft}s
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        timerPct > 50 ? "bg-secondary" : timerPct > 20 ? "bg-yellow-400" : "bg-destructive"
                      )}
                      style={{ width: `${timerPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Image */}
              {task.type === "image" && payload?.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border/40">
                  <img src={payload.imageUrl as string} alt="Task" className="w-full h-44 object-cover" />
                </div>
              )}

              {/* Question */}
              <p className="text-sm font-bold leading-snug">
                {payload?.question as string ?? "Etichetta questo elemento:"}
              </p>

              {/* Text snippet */}
              {task.type === "text" && payload?.text && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    "{payload.text as string}"
                  </p>
                </div>
              )}

              {/* Answer options */}
              {options && (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => {
                    const isSelected = selected === opt;
                    const isCorrectAnswer = opt === (task.dataPayload as any)?.correctAnswer;
                    const isWrongSelected = submitted && isSelected && !isCorrectAnswer;
                    const isCorrectReveal = submitted && isCorrectAnswer && task.isGolden;

                    return (
                      <button
                        key={opt}
                        disabled={submitted}
                        onClick={() => handleOptionSelect(opt)}
                        className={cn(
                          "p-3 rounded-xl border text-sm font-bold transition-all duration-200 text-left relative overflow-hidden",
                          "active:scale-95",
                          isSelected && !submitted
                            ? "border-primary bg-primary/20 text-primary shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                            : isWrongSelected
                            ? "border-destructive/80 bg-destructive/20 text-destructive"
                            : isCorrectReveal
                            ? "border-secondary/80 bg-secondary/20 text-secondary"
                            : submitted
                            ? "border-border/30 bg-muted/20 text-muted-foreground"
                            : "border-border/40 bg-card/40 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                        )}
                      >
                        {isSelected && !submitted && (
                          <span className="absolute inset-0 bg-primary/10 animate-pulse" />
                        )}
                        <span className="relative">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Result feedback */}
              {submitted && result && (
                <div className={cn(
                  "text-center py-3 rounded-xl font-black text-sm",
                  result.correct
                    ? "bg-secondary/20 text-secondary border border-secondary/30"
                    : "bg-destructive/20 text-destructive border border-destructive/30"
                )}>
                  {result.correct
                    ? `✓ Corretto! +${result.points} pts  +${result.xp} XP${combo > 1 ? ` 🔥 Combo x${comboMultiplier}!` : ""}`
                    : timeLeft <= 0
                    ? "⏱ Tempo scaduto!"
                    : "✗ Risposta errata — riprova!"}
                </div>
              )}

              {/* CTA button */}
              {!submitted ? (
                <Button
                  className="w-full font-black h-12 text-base"
                  disabled={!selected || submitResponse.isPending}
                  onClick={handleSubmit}
                >
                  {submitResponse.isPending ? "Invio..." : "Conferma risposta"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  className="w-full font-black h-12 text-base"
                  variant="outline"
                  onClick={handleNext}
                >
                  Task successivo
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
