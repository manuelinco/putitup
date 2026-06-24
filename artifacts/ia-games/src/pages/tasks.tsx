import { useState, useEffect, useRef, useCallback } from "react";
import { useGetNextTask, useSubmitResponse, useGetUserStats, useWatchAd, getGetUserStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useTelegramHaptic } from "@/hooks/useTelegram";
import { Layout } from "@/components/layout";
import { AdChallenge } from "@/components/ad-challenge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Timer, Target, Star, ChevronRight, Flame, Shield, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const TASK_TIME_SECONDS = 30;

const difficultyConfig: Record<string, { label: string; color: string; points: number }> = {
  easy:   { label: "EASY",   color: "text-secondary border-secondary/40 bg-secondary/10",      points: 10 },
  medium: { label: "MEDIUM", color: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",   points: 20 },
  hard:   { label: "HARD",   color: "text-destructive border-destructive/40 bg-destructive/10", points: 30 },
};

const typeLabels: Record<string, string> = {
  image:          "IMAGE",
  text:           "TEXT",
  classification: "CLASSIFICATION",
};

const TON_PER_TASK = 0.00004;

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const userId = user?.id ?? 0;
  const { impact, notification } = useTelegramHaptic();

  const { data: stats, refetch: refetchStats } = useGetUserStats(userId, { query: { enabled: !!userId } as any });
  const { data: task, refetch: refetchTask, isLoading } = useGetNextTask(
    { userId },
    { query: { enabled: !!userId } as any }
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
  const [tasksCompletedCount, setTasksCompletedCount] = useState(0);
  const [showAdChallenge, setShowAdChallenge] = useState(false);
  const [adPending, setAdPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const BOT_PENALTY_KEY = "putitup_bot_penalty_until";
  const [botPenaltyUntil, setBotPenaltyUntil] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(BOT_PENALTY_KEY);
      const ts = stored ? parseInt(stored, 10) : 0;
      return ts > Date.now() ? ts : 0;
    } catch { return 0; }
  });
  const [botCooldownSec, setBotCooldownSec] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(BOT_PENALTY_KEY);
      const ts = stored ? parseInt(stored, 10) : 0;
      return ts > Date.now() ? Math.ceil((ts - Date.now()) / 1000) : 0;
    } catch { return 0; }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const startTime = useRef<number>(Date.now());

  const speakTranscript = useCallback((text: string, lang?: string) => {
    if (!window.speechSynthesis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const langMap: Record<string, string> = {
      EN: "en-US", IT: "it-IT", FR: "fr-FR", ES: "es-ES", DE: "de-DE",
      "en-US": "en-US", "it-IT": "it-IT", "fr-FR": "fr-FR",
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langMap[String(lang ?? "EN").toUpperCase()] ?? "en-US";
    utterance.rate = 0.88;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking]);

  useEffect(() => {
    if (!task) return;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setSelected(null);
    setSubmitted(false);
    setResult(null);
    setSubmitError(null);
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
    if (!userId) {
      setSubmitError("Connect your wallet to submit answers.");
      return;
    }
    setSubmitError(null);
    setTimerActive(false);
    impact("medium");
    const responseTimeMs = Date.now() - startTime.current;
    try {
      const res = await submitResponse.mutateAsync({
        data: { userId, taskId: task.id, answer: selected, responseTimeMs },
      });
      setResult({ correct: true, points: res.pointsEarned, xp: res.xpEarned });
      setSubmitted(true);
      notification("success");
      setCombo((c) => c + 1);
      setBounce(true);
      setTimeout(() => setBounce(false), 600);
      const newCount = tasksCompletedCount + 1;
      setTasksCompletedCount(newCount);
      setTotalToday((t) => t + 1);
      if (newCount % 10 === 0) {
        setAdPending(true);
      }
      refetchStats();
      queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(userId) });
      refreshUser();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.includes("already")) {
        setSubmitError("Answer already submitted for this task.");
      } else if (msg.includes("energy") || msg.includes("400")) {
        setSubmitError("Not enough energy — watch an ad to recharge.");
      } else {
        setSubmitError("Submission failed — please try again.");
      }
      notification("error");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleNext = () => {
    impact("light");
    if (adPending) {
      setShowAdChallenge(true);
      return;
    }
    refetchTask();
  };

  const handleOptionSelect = (opt: string) => {
    if (!submitted) {
      impact("light");
      setSelected(opt);
    }
  };

  const handleAdComplete = async () => {
    setShowAdChallenge(false);
    setAdPending(false);
    await watchAd.mutateAsync({ data: { userId, adType: "rewarded" } });
    refetchStats();
    refreshUser();
    notification("success");
    refetchTask();
  };

  // Anti-bot penalty: drain energy + 90s cooldown before next ad (persists across refreshes)
  const handleAdFail = () => {
    setShowAdChallenge(false);
    notification("error");
    const until = Date.now() + 90_000;
    try { localStorage.setItem(BOT_PENALTY_KEY, String(until)); } catch {}
    setBotPenaltyUntil(until);
    setBotCooldownSec(90);
  };

  // Countdown ticker for bot penalty
  useEffect(() => {
    if (botPenaltyUntil <= Date.now()) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((botPenaltyUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setBotCooldownSec(0);
        setBotPenaltyUntil(0);
        try { localStorage.removeItem(BOT_PENALTY_KEY); } catch {}
        clearInterval(interval);
      } else {
        setBotCooldownSec(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [botPenaltyUntil]);


  const payload = task?.dataPayload as Record<string, unknown> | undefined;
  const options = payload?.options as string[] | undefined;
  const energy = stats?.energy ?? user?.energy ?? 100;
  const maxEnergy = stats?.maxEnergy ?? user?.maxEnergy ?? 100;
  const energyPct = (energy / maxEnergy) * 100;
  const timerPct = (timeLeft / TASK_TIME_SECONDS) * 100;
  const comboMultiplier = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;

  return (
    <Layout>
      {showAdChallenge && (
        <AdChallenge
          onComplete={handleAdComplete}
          onFail={handleAdFail}
          rewardText="+50 Energy"
          adDuration={20}
        />
      )}

      <div className="p-4 space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-card/60 border border-border/40 rounded-xl p-2 text-center">
            <Zap className="w-3 h-3 text-secondary mx-auto mb-0.5" />
            <p className="text-sm font-black">{energy}</p>
            <p className="text-[9px] text-muted-foreground uppercase">Energy</p>
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
            <p className="text-[9px] text-muted-foreground uppercase">Acc.</p>
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
            <span>{stats?.xp ?? user?.xp ?? 0} XP · {totalToday} today</span>
          </div>
          <Progress value={((stats?.xp ?? user?.xp ?? 0) % 500) / 5} className="h-1" />
        </div>

        {/* TON reward indicator */}
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/30">
            <span className="text-[10px] font-black text-accent">+{TON_PER_TASK} TON</span>
            <span className="text-[10px] text-muted-foreground">per task</span>
          </div>
        </div>

        {/* Bot penalty warning — shown when user failed the red dot challenge */}
        {botCooldownSec > 0 && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-red-500/60 bg-red-500/10 animate-pulse">
            <div>
              <p className="text-xs font-black text-red-400">🤖 Bot detected — ads blocked</p>
              <p className="text-[10px] text-muted-foreground">You missed the red dot. Wait {botCooldownSec}s</p>
            </div>
            <div className="flex items-center justify-center w-12 h-8 rounded-lg border border-red-500/40 bg-red-500/20">
              <span className="text-xs font-black text-red-400">{botCooldownSec}s</span>
            </div>
          </div>
        )}

        {/* Low energy warning */}
        {energy < 20 && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-destructive/40 bg-destructive/10">
            <div>
              <p className="text-xs font-black text-destructive">Energy depleted!</p>
              <p className="text-[10px] text-muted-foreground">
                {botCooldownSec > 0 ? `Ad blocked — bot penalty (${botCooldownSec}s)` : "Watch an ad to recharge"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-destructive/40 text-destructive h-8"
              onClick={() => setShowAdChallenge(true)}
              disabled={watchAd.isPending || botCooldownSec > 0}
            >
              {botCooldownSec > 0 ? `${botCooldownSec}s` : "Watch Ad"}
            </Button>
          </div>
        )}

        {/* MINI-GAME CARD */}
        {isLoading ? (
          <Card className="border-border/50 min-h-[300px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Loading task...</p>
            </div>
          </Card>
        ) : !task ? (
          <Card className="border-border/50 text-center min-h-[200px] flex items-center justify-center">
            <CardContent className="p-8 space-y-3">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="font-black">No tasks available</p>
              <p className="text-xs text-muted-foreground">All done! Come back soon.</p>
              <Button variant="outline" size="sm" onClick={handleNext}>Retry</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(
            "border transition-all duration-300",
            submitted
              ? "border-accent/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
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
                  <span className="text-[9px] text-accent font-bold">+{TON_PER_TASK} TON</span>
                </div>
              </div>

              {/* Timer bar */}
              {!submitted && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="w-3 h-3" /> Time
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
              {task.type === "image" && !!payload?.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border/40">
                  <img src={String(payload.imageUrl)} alt="Task" className="w-full h-44 object-cover" />
                </div>
              )}

              {/* Audio player — Web Speech API reads the transcript */}
              {(!!payload?.audioUrl || !!payload?.transcript) && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-accent tracking-wider">🎙 Audio Clip</p>
                    {!!payload?.language && (
                      <span className="text-[9px] font-mono bg-muted/50 px-1.5 py-0.5 rounded uppercase">
                        {String(payload.language)}
                      </span>
                    )}
                  </div>
                  {!!payload?.transcript && (
                    <p className="text-[11px] text-muted-foreground italic leading-relaxed line-clamp-2">
                      "{String(payload.transcript)}"
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "w-full h-8 text-[11px] font-bold gap-2 transition-all",
                      isSpeaking
                        ? "border-accent/60 text-accent bg-accent/10"
                        : "border-accent/30 text-accent/80 hover:bg-accent/10"
                    )}
                    onClick={() => speakTranscript(
                      String(payload?.transcript ?? payload?.audioUrl ?? ""),
                      String(payload?.language ?? "EN")
                    )}
                  >
                    {isSpeaking
                      ? <><VolumeX className="w-3.5 h-3.5" /> Stop Audio</>
                      : <><Volume2 className="w-3.5 h-3.5" /> Play Audio</>
                    }
                  </Button>
                </div>
              )}

              {/* Question */}
              <p className="text-sm font-bold leading-snug">
                {String(payload?.question ?? "Label this element:")}
              </p>

              {/* Text snippet for text tasks */}
              {task.type === "text" && !!(payload?.content ?? payload?.text) && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    "{String(payload?.content ?? payload?.text)}"
                  </p>
                </div>
              )}

              {/* Transcript for classification / audio tasks */}
              {task.type === "classification" && !!payload?.transcript && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30 space-y-1">
                  <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Transcript</p>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    "{String(payload.transcript)}"
                  </p>
                  {!!payload?.language && (
                    <span className="inline-block text-[9px] bg-muted/50 px-1.5 py-0.5 rounded font-mono">
                      {String(payload.language)}
                    </span>
                  )}
                </div>
              )}

              {/* Content/text for classification without transcript */}
              {task.type === "classification" && !payload?.transcript && !!(payload?.content ?? payload?.text) && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    "{String(payload?.content ?? payload?.text)}"
                  </p>
                </div>
              )}

              {/* Answer options */}
              {options && (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => {
                    const isSelected = selected === opt;
                    const isSubmittedSelected = submitted && isSelected;

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
                            : isSubmittedSelected
                            ? "border-accent/60 bg-accent/10 text-accent"
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

              {/* Neutral result feedback — no correct/wrong reveal */}
              {submitted && result && (
                <div className="text-center py-3 rounded-xl bg-accent/10 border border-accent/20 space-y-0.5">
                  <p className="font-black text-sm text-accent">✓ Answer recorded</p>
                  <p className="text-[11px] text-muted-foreground">Pending review</p>
                  {result.points > 0 && (
                    <p className="text-[11px] font-black text-secondary mt-1">
                      +{result.points} pts · +{result.xp} XP · +{TON_PER_TASK} TON
                      {combo > 1 ? ` 🔥 Combo x${comboMultiplier}!` : ""}

                    </p>
                  )}
                </div>
              )}

              {/* Submit error message */}
              {submitError && (
                <div className="text-center py-2 px-3 rounded-xl bg-destructive/10 border border-destructive/30">
                  <p className="text-xs font-bold text-destructive">{submitError}</p>
                </div>
              )}

              {/* CTA button */}
              {!submitted ? (
                <Button
                  className="w-full font-black h-12 text-base"
                  disabled={!selected || submitResponse.isPending}
                  onClick={handleSubmit}
                >
                  {submitResponse.isPending ? "Submitting..." : "Submit Answer"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  className={cn(
                    "w-full font-black h-12 text-base",
                    adPending ? "border-yellow-400/60 text-yellow-400 hover:bg-yellow-400/10" : ""
                  )}
                  variant="outline"
                  onClick={handleNext}
                >
                  {adPending ? "📺 Watch Ad to Continue" : "Next Task"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ad ogni 10 task — hint visivo */}
        {!isLoading && !adPending && (
          <div className="text-center text-[10px] text-muted-foreground/50">
            <Zap className="w-2.5 h-2.5 inline mr-1" />
            Ad every 10 tasks · {10 - (tasksCompletedCount % 10)} tasks until next ad
          </div>
        )}
      </div>
    </Layout>
  );
}
