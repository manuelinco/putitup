import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Volume2, RotateCcw } from "lucide-react";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

type Phase = "ad" | "dot_active" | "restarting" | "done" | "failed";

const MAX_MISSES = 3;

export function AdChallenge({ onComplete, onFail, rewardText = "+10 Tasks", adDuration = 25 }: AdChallengeProps) {
  const [phase, setPhase] = useState<Phase>("ad");
  const [adProgress, setAdProgress] = useState(0);
  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [dotTimer, setDotTimer] = useState(3);
  const [dotCount, setDotCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [requiredDots] = useState(() => 1 + Math.floor(Math.random() * 2));
  const [skipAvailable, setSkipAvailable] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const phaseRef = useRef<Phase>("ad");
  const dotCountRef = useRef(0);
  const adStartRef = useRef(Date.now());
  const scheduledDotsRef = useRef<number[]>([]);
  const progressRef = useRef(0);

  phaseRef.current = phase;
  dotCountRef.current = dotCount;

  const scheduleDots = useCallback(() => {
    const minTime = adDuration * 0.15;
    const maxTime = adDuration * 0.80;
    const dots: number[] = [];
    for (let i = 0; i < requiredDots; i++) {
      const t = minTime + Math.random() * (maxTime - minTime);
      dots.push(parseFloat(t.toFixed(2)));
    }
    dots.sort((a, b) => a - b);
    scheduledDotsRef.current = dots;
  }, [adDuration, requiredDots]);

  const spawnDot = useCallback(() => {
    const margin = 18;
    const x = margin + Math.random() * (100 - margin * 2);
    const y = margin + Math.random() * (100 - margin * 2);
    setDotPos({ x, y });
    setDotTimer(3);
    setPhase("dot_active");
    phaseRef.current = "dot_active";
  }, []);

  // Schedule dots on mount
  useEffect(() => { scheduleDots(); }, [scheduleDots]);

  // ── Ad progress ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ad") return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - adStartRef.current) / 1000;
      const progress = Math.min((elapsed / adDuration) * 100, 100);
      setAdProgress(progress);
      progressRef.current = progress;

      if (progress >= 85 && !skipAvailable) setSkipAvailable(true);

      const pending = scheduledDotsRef.current;
      if (pending.length > 0 && elapsed >= pending[0] && phaseRef.current === "ad") {
        scheduledDotsRef.current = pending.slice(1);
        clearInterval(interval);
        spawnDot();
        return;
      }

      if (progress >= 100) {
        clearInterval(interval);
        setPhase("done");
        setTimeout(() => onComplete(), 400);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [phase, adDuration, skipAvailable, spawnDot, onComplete]);

  // ── Dot countdown — miss = restart, 3 misses = fail ───────────────────────
  useEffect(() => {
    if (phase !== "dot_active") return;
    if (dotTimer <= 0) {
      const newMissCount = missCount + 1;
      setMissCount(newMissCount);

      if (newMissCount >= MAX_MISSES) {
        setPhase("failed");
        setTimeout(() => onFail(), 800);
        return;
      }

      // Restart the ad from the beginning
      setPhase("restarting");
      setTimeout(() => {
        adStartRef.current = Date.now();
        setAdProgress(0);
        progressRef.current = 0;
        setSkipAvailable(false);
        setDotCount(0);
        dotCountRef.current = 0;
        scheduleDots();
        setPhase("ad");
      }, 1200);
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, onFail, missCount, scheduleDots]);

  const handleDotTap = () => {
    if (phase !== "dot_active") return;
    const newCount = dotCountRef.current + 1;
    setDotCount(newCount);
    setFeedbackKey((k) => k + 1);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 900);

    if (newCount >= requiredDots && scheduledDotsRef.current.length === 0) {
      setPhase("done");
      setTimeout(() => onComplete(), 500);
    } else {
      adStartRef.current = Date.now() - (progressRef.current / 100) * adDuration * 1000;
      setPhase("ad");
    }
  };

  const handleSkip = () => {
    if (!skipAvailable || phase !== "ad") return;
    setPhase("done");
    setTimeout(() => onComplete(), 200);
  };

  const skipCooldown = Math.max(0, Math.ceil(adDuration * 0.85 - (adProgress / 100) * adDuration));

  const isVideoPaused = phase === "dot_active" || phase === "restarting";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm relative">
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
          phase === "failed"     ? "border-destructive shadow-[0_0_30px_rgba(239,68,68,0.4)]" :
          phase === "done"       ? "border-secondary shadow-[0_0_30px_rgba(74,222,128,0.4)]" :
          phase === "restarting" ? "border-yellow-500/60 shadow-[0_0_30px_rgba(234,179,8,0.3)]" :
          phase === "dot_active" ? "border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.35)]" :
                                   "border-primary/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
        )}>

          {/* Ad header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
              <Volume2 className={cn("w-3 h-3 transition-colors", isVideoPaused ? "text-red-400" : "text-muted-foreground")} />
              <span className="text-[10px] text-muted-foreground font-semibold">Sponsored</span>
              {missCount > 0 && (
                <span className="text-[9px] font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                  {missCount}/{MAX_MISSES} misses
                </span>
              )}
            </div>
            <button
              onClick={handleSkip}
              disabled={!skipAvailable || phase !== "ad"}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-lg transition-all",
                skipAvailable && phase === "ad"
                  ? "text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20"
                  : "text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              {skipAvailable && phase === "ad" ? "Skip ›" : `Skip in ${skipCooldown}s`}
            </button>
          </div>

          {/* Ad body — video area */}
          <div className="relative h-56 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center gap-3 select-none overflow-hidden">
            <div className="absolute top-4 right-4 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-accent/10 rounded-full blur-2xl" />

            {/* Main ad content — blurred when paused */}
            <div className={cn(
              "relative text-center space-y-2 transition-all duration-300",
              isVideoPaused ? "blur-md opacity-30 scale-95 pointer-events-none" : "blur-0 opacity-100 scale-100"
            )}>
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">
                PUTITUP
              </div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary inline-block mt-2">
                {rewardText}
              </div>
            </div>

            {/* ── VIDEO PAUSED overlay (dot_active) ── */}
            {phase === "dot_active" && (
              <>
                <div className="absolute inset-0 bg-black/50" />

                {/* Pause icon */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/70 border border-red-500/60 rounded-full px-3 py-1.5 shadow-lg">
                  <span className="text-red-400 text-[11px] font-black tracking-wide">⏸ VIDEO PAUSED</span>
                  <span className="text-[10px] font-bold text-white/70">· {dotTimer}s</span>
                </div>

                {/* Red dot */}
                <button
                  onClick={handleDotTap}
                  style={{
                    position: "absolute",
                    left: `${dotPos.x}%`,
                    top: `${dotPos.y}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 20,
                  }}
                  className="w-12 h-12 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_28px_8px_rgba(239,68,68,0.8)] animate-pulse hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                  aria-label="Tap the red dot"
                />

                {/* Countdown ring */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                  <div className={cn(
                    "text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full border",
                    dotTimer <= 1
                      ? "text-red-400 border-red-500/60 bg-red-500/10 animate-pulse"
                      : "text-white/60 border-white/20 bg-black/40"
                  )}>
                    TAP RED DOT TO RESUME
                  </div>
                </div>
              </>
            )}

            {/* ── RESTARTING overlay ── */}
            {phase === "restarting" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-30">
                <RotateCcw className="w-10 h-10 text-yellow-400 animate-spin" />
                <p className="font-black text-yellow-300 text-sm tracking-wide">Ad restarting…</p>
                <p className="text-[10px] text-white/50">You missed the dot — {MAX_MISSES - missCount} attempts left</p>
              </div>
            )}

            {/* ── SUCCESS flash ── */}
            {showSuccess && (
              <div key={feedbackKey} className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-green-500/20 border border-green-400/50 text-green-300 text-[11px] font-black px-3 py-1 rounded-full shadow animate-bounce">
                ✓ Got it!
              </div>
            )}

            {/* ── FAILED overlay ── */}
            {phase === "failed" && (
              <div className="absolute inset-0 bg-destructive/30 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-30">
                <X className="w-12 h-12 text-destructive" />
                <p className="font-black text-destructive text-sm">Bot detected — access denied</p>
                <p className="text-[10px] text-white/50">Missed the dot {MAX_MISSES} times</p>
              </div>
            )}

            {/* ── DONE overlay ── */}
            {phase === "done" && (
              <div className="absolute inset-0 bg-secondary/20 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-30">
                <p className="text-3xl">✅</p>
                <p className="font-black text-secondary text-sm">{rewardText} Unlocked!</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="px-4 py-3 space-y-1.5 bg-muted/20">
            <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
              <span>{isVideoPaused ? "⏸ PAUSED — TAP DOT" : "WATCHING AD"}</span>
              <span>{Math.round(adProgress)}%</span>
            </div>
            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-100",
                  isVideoPaused
                    ? "bg-gradient-to-r from-red-500 to-red-400"
                    : "bg-gradient-to-r from-primary to-accent"
                )}
                style={{ width: `${adProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-1.5">
                {Array.from({ length: requiredDots }).map((_, i) => (
                  <div key={i} className={cn(
                    "w-3 h-3 rounded-full border-2 transition-all",
                    dotCount > i
                      ? "bg-red-500 border-red-400 shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                      : "bg-muted/40 border-muted-foreground/30"
                  )} />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground">
                {dotCount}/{requiredDots} dots caught
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
