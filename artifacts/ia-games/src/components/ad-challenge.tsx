import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

// Phases:
//  waiting_adsgram → Adsgram ad playing (our UI is minimal loading screen)
//  dot_challenge   → Adsgram done=true → show anti-bot dot in OUR component
//  ad              → Fallback: no Adsgram → fake countdown with embedded dot
//  dot_active      → Dot appearing inside fake ad
//  restarting      → Dot missed in fake ad
//  done / failed
type Phase =
  | "waiting_adsgram"
  | "dot_challenge"
  | "ad"
  | "dot_active"
  | "restarting"
  | "done"
  | "failed";

const MAX_MISSES = 3;
const DOT_WINDOW_S = 4;

export function AdChallenge({
  onComplete,
  onFail,
  rewardText = "+10 Tasks",
  adDuration = 25,
}: AdChallengeProps) {
  const [phase, setPhase] = useState<Phase>("waiting_adsgram");
  const phaseRef = useRef<Phase>("waiting_adsgram");
  phaseRef.current = phase;

  /* ── Anti-bot dot state (used in both dot_challenge and dot_active) ── */
  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [dotTimer, setDotTimer] = useState(DOT_WINDOW_S);
  const [showSuccess, setShowSuccess] = useState(false);

  /* ── Fake-ad state ── */
  const [adProgress, setAdProgress] = useState(0);
  const [dotCount, setDotCount] = useState(0);
  const dotCountRef = useRef(0);
  const [missCount, setMissCount] = useState(0);
  const [requiredDots] = useState(() => 1 + Math.floor(Math.random() * 2));
  const [skipAvailable, setSkipAvailable] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState(0);

  const adStartRef = useRef(Date.now());
  const scheduledDotsRef = useRef<number[]>([]);
  const progressRef = useRef(0);

  const { showAd } = useAdsgram();

  /* ══════════════════════════════════════════════════════
     1. ADSGRAM FLOW
     a) showAd() → Adsgram overlay opens (we show loading screen)
     b) done=true  → anti-bot dot challenge in OUR component
     b) done=false → immediate fail (user skipped/closed ad)
  ══════════════════════════════════════════════════════ */

  useEffect(() => {
    showAd().then((done) => {
      if (!done) {
        // Ad was skipped or closed — no reward
        setPhase("failed");
        setTimeout(() => onFail(), 800);
      } else {
        // Ad watched fully — show anti-bot dot challenge
        spawnChallengeDot();
        setPhase("dot_challenge");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spawnChallengeDot = useCallback(() => {
    const margin = 15;
    setDotPos({
      x: margin + Math.random() * (100 - margin * 2),
      y: margin + Math.random() * (100 - margin * 2),
    });
    setDotTimer(DOT_WINDOW_S);
  }, []);

  // dot_challenge countdown
  useEffect(() => {
    if (phase !== "dot_challenge") return;
    if (dotTimer <= 0) {
      // Missed dot after watching full ad → bot detected
      setPhase("failed");
      setTimeout(() => onFail(), 800);
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, onFail]);

  const handleChallengeDotTap = () => {
    if (phase !== "dot_challenge") return;
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 900);
    setPhase("done");
    setTimeout(() => onComplete(), 500);
  };

  /* ══════════════════════════════════════════════════════
     2. FALLBACK FAKE-AD FLOW (when Adsgram not active)
     showAd() returns false instantly if BLOCK_ID is placeholder
     → but we already catch that in the Adsgram hook returning false
     → which triggers immediate fail above.
     So "ad" phase is now triggered explicitly for fallback only.
     We keep this for dev/testing.
  ══════════════════════════════════════════════════════ */

  const scheduleDotsForFake = useCallback(() => {
    const minTime = adDuration * 0.15;
    const maxTime = adDuration * 0.80;
    const dots: number[] = [];
    for (let i = 0; i < requiredDots; i++) {
      dots.push(minTime + Math.random() * (maxTime - minTime));
    }
    dots.sort((a, b) => a - b);
    scheduledDotsRef.current = dots;
  }, [adDuration, requiredDots]);

  const spawnFakeDot = useCallback(() => {
    const margin = 18;
    setDotPos({
      x: margin + Math.random() * (100 - margin * 2),
      y: margin + Math.random() * (100 - margin * 2),
    });
    setDotTimer(3);
    setPhase("dot_active");
    phaseRef.current = "dot_active";
  }, []);

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
        spawnFakeDot();
        return;
      }
      if (progress >= 100) {
        clearInterval(interval);
        setPhase("done");
        setTimeout(() => onComplete(), 400);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [phase, adDuration, skipAvailable, spawnFakeDot, onComplete]);

  useEffect(() => {
    if (phase !== "dot_active") return;
    if (dotTimer <= 0) {
      const newMiss = missCount + 1;
      setMissCount(newMiss);
      if (newMiss >= MAX_MISSES) {
        setPhase("failed");
        setTimeout(() => onFail(), 800);
        return;
      }
      setPhase("restarting");
      setTimeout(() => {
        adStartRef.current = Date.now();
        setAdProgress(0);
        progressRef.current = 0;
        setSkipAvailable(false);
        setDotCount(0);
        dotCountRef.current = 0;
        scheduleDotsForFake();
        setPhase("ad");
      }, 1200);
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, onFail, missCount, scheduleDotsForFake]);

  const handleFakeDotTap = () => {
    if (phase !== "dot_active") return;
    const newCount = dotCountRef.current + 1;
    dotCountRef.current = newCount;
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

  /* ══════════════════════════════════════════════════════  RENDER  ══ */

  const skipCooldown = Math.max(0, Math.ceil(adDuration * 0.85 - (adProgress / 100) * adDuration));

  // ── Result screens ──────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="w-14 h-14 text-secondary" />
          <p className="font-black text-secondary text-base">{rewardText} Unlocked!</p>
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <X className="w-12 h-12 text-destructive" />
          <p className="font-black text-destructive text-base">Access denied</p>
          <p className="text-[11px] text-white/50">Watch the full ad and tap the red dot</p>
        </div>
      </div>
    );
  }

  // ── Waiting for Adsgram ─────────────────────────────────────────────
  if (phase === "waiting_adsgram") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-9 h-9 text-primary animate-spin" />
          <p className="text-sm font-semibold text-white/70">Loading ad…</p>
        </div>
      </div>
    );
  }

  // ── Anti-bot dot challenge (after Adsgram watched) ──────────────────
  if (phase === "dot_challenge") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm">
          <div className="relative bg-card border border-red-500/70 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.35)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">⚡ Anti-bot check</span>
              <span className={cn(
                "text-xs font-black tabular-nums",
                dotTimer <= 1 ? "text-red-400 animate-pulse" : "text-white/60"
              )}>{dotTimer}s</span>
            </div>

            {/* Dot arena */}
            <div className="relative h-64 bg-gradient-to-br from-card via-card/80 to-background select-none overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <p className="text-xs text-white/30 font-semibold">Tap the red dot to prove you're human</p>
              </div>

              {/* Red dot */}
              <button
                onClick={handleChallengeDotTap}
                style={{ position: "absolute", left: `${dotPos.x}%`, top: `${dotPos.y}%`, transform: "translate(-50%,-50%)" }}
                className="w-14 h-14 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_28px_10px_rgba(239,68,68,0.7)] animate-pulse active:scale-90 transition-transform z-10"
                aria-label="Tap the red dot"
              />

              {showSuccess && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-green-500/20 border border-green-400/50 text-green-300 text-[11px] font-black px-3 py-1 rounded-full animate-bounce z-20">
                  ✓ Human verified!
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="px-4 py-2.5 bg-muted/20">
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-1000"
                  style={{ width: `${((DOT_WINDOW_S - dotTimer) / DOT_WINDOW_S) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback fake-ad UI ─────────────────────────────────────────────
  const isVideoPaused = phase === "dot_active" || phase === "restarting";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm">
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
          phase === "restarting" ? "border-yellow-500/60" :
          phase === "dot_active" ? "border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.35)]" :
                                   "border-primary/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
        )}>
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
              {missCount > 0 && <span className="text-[9px] font-bold text-yellow-400">{missCount}/{MAX_MISSES} miss</span>}
            </div>
            <button onClick={handleSkip} disabled={!skipAvailable || phase !== "ad"}
              className={cn("text-[10px] font-bold px-2 py-1 rounded-lg transition-all",
                skipAvailable && phase === "ad"
                  ? "text-primary bg-primary/10 border border-primary/30"
                  : "text-muted-foreground/40 cursor-not-allowed")}>
              {skipAvailable && phase === "ad" ? "Skip ›" : `Skip in ${skipCooldown}s`}
            </button>
          </div>

          <div className="relative h-56 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center select-none overflow-hidden">
            <div className={cn("relative text-center space-y-2 transition-all duration-300",
              isVideoPaused ? "blur-md opacity-30 scale-95 pointer-events-none" : "")}>
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">PUTITUP</div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary inline-block">{rewardText}</div>
            </div>

            {phase === "dot_active" && (
              <>
                <div className="absolute inset-0 bg-black/50" />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/70 border border-red-500/60 rounded-full px-3 py-1.5">
                  <span className="text-red-400 text-[11px] font-black">⏸ PAUSED · {dotTimer}s</span>
                </div>
                <button onClick={handleFakeDotTap}
                  style={{ position: "absolute", left: `${dotPos.x}%`, top: `${dotPos.y}%`, transform: "translate(-50%,-50%)", zIndex: 20 }}
                  className="w-12 h-12 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_28px_8px_rgba(239,68,68,0.8)] animate-pulse active:scale-90 transition-transform cursor-pointer"
                  aria-label="Tap the red dot" />
              </>
            )}

            {phase === "restarting" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-30">
                <RotateCcw className="w-10 h-10 text-yellow-400 animate-spin" />
                <p className="font-black text-yellow-300 text-sm">Restarting… {MAX_MISSES - missCount} left</p>
              </div>
            )}

            {showSuccess && (
              <div key={feedbackKey} className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-green-500/20 border border-green-400/50 text-green-300 text-[11px] font-black px-3 py-1 rounded-full animate-bounce">
                ✓ Got it!
              </div>
            )}
          </div>

          {phase === "ad" && (
            <div className="px-4 py-3 space-y-1.5 bg-muted/20">
              <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
                <span>WATCHING AD</span><span>{Math.round(adProgress)}%</span>
              </div>
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-100" style={{ width: `${adProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
