import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Loader2 } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

type Phase =
  | "real_ad"      // Adsgram ad playing — dot will appear on top
  | "ad"           // Fallback fake countdown
  | "dot_active"   // Dot showing (over Adsgram OR fake ad)
  | "restarting"   // Fake-ad dot missed, restarting
  | "done"
  | "failed";

const MAX_MISSES = 3;
const DOT_WINDOW_S = 3; // seconds to tap the dot once it appears

export function AdChallenge({
  onComplete,
  onFail,
  rewardText = "+10 Tasks",
  adDuration = 25,
}: AdChallengeProps) {
  /* ── Shared state ── */
  const [phase, setPhase] = useState<Phase>("real_ad");
  const phaseRef = useRef<Phase>("real_ad");
  phaseRef.current = phase;

  /* ── Real-ad specific ── */
  const [dotPos] = useState(() => ({
    x: 15 + Math.random() * 70,
    y: 20 + Math.random() * 60,
  }));
  const [showPortalDot, setShowPortalDot] = useState(false);
  const [portalDotTimer, setPortalDotTimer] = useState(DOT_WINDOW_S);
  const dotTappedRef = useRef(false);
  const adResultRef = useRef<boolean | null>(null); // true=watched, false=skipped/err

  /* ── Fake-ad specific ── */
  const [adProgress, setAdProgress] = useState(0);
  const [fakeDotPos, setFakeDotPos] = useState({ x: 50, y: 50 });
  const [fakeDotTimer, setFakeDotTimer] = useState(3);
  const [fakeDotCount, setFakeDotCount] = useState(0);
  const fakeDotCountRef = useRef(0);
  const [missCount, setMissCount] = useState(0);
  const [requiredDots] = useState(() => 1 + Math.floor(Math.random() * 2));
  const [skipAvailable, setSkipAvailable] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState(0);

  const adStartRef = useRef(Date.now());
  const scheduledDotsRef = useRef<number[]>([]);
  const progressRef = useRef(0);

  const { showAd } = useAdsgram();

  /* ═══════════════════════════════════════════════════
     REAL-AD FLOW
     1. Call Adsgram → their overlay opens
     2. After DOT_APPEAR_AFTER_MS → show dot via portal (z:999999)
     3. When ad resolves → check if dot was tapped
  ═══════════════════════════════════════════════════ */

  // tryFinish: called when BOTH ad resolved AND dot interaction is done
  const tryFinish = useCallback(() => {
    const adResult = adResultRef.current;
    if (adResult === null) return; // ad not resolved yet

    if (adResult && dotTappedRef.current) {
      setPhase("done");
      setTimeout(() => onComplete(), 500);
    } else {
      setPhase("failed");
      setTimeout(() => onFail(), 800);
    }
  }, [onComplete, onFail]);

  useEffect(() => {
    if (phase !== "real_ad") return;

    // Start the real Adsgram ad
    showAd().then((done) => {
      adResultRef.current = done;
      setShowPortalDot(false); // hide dot when ad closes
      // If dot timer still counting, give a short moment then check
      setTimeout(() => tryFinish(), 300);
    });

    // Show dot at a RANDOM moment during the ad (between 2s and 12s)
    const randomDelay = 2000 + Math.random() * 10000;
    const dotTimer = setTimeout(() => {
      if (phaseRef.current !== "real_ad") return;
      setShowPortalDot(true);
      setPortalDotTimer(DOT_WINDOW_S);
    }, randomDelay);

    return () => clearTimeout(dotTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Portal dot countdown
  useEffect(() => {
    if (!showPortalDot || dotTappedRef.current) return;
    if (portalDotTimer <= 0) {
      setShowPortalDot(false);
      // dot missed — don't call tryFinish yet, wait for ad to resolve
      return;
    }
    const t = setTimeout(() => setPortalDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [showPortalDot, portalDotTimer]);

  const handlePortalDotTap = () => {
    if (!showPortalDot) return;
    dotTappedRef.current = true;
    setShowPortalDot(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 900);
    tryFinish(); // in case ad already resolved
  };

  /* ═══════════════════════════════════════════════════
     FAKE-AD FALLBACK (when Adsgram not configured)
  ═══════════════════════════════════════════════════ */

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
    setFakeDotPos({
      x: margin + Math.random() * (100 - margin * 2),
      y: margin + Math.random() * (100 - margin * 2),
    });
    setFakeDotTimer(3);
    setPhase("dot_active");
    phaseRef.current = "dot_active";
  }, []);

  // Fake-ad progress ticker
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

  // Fake-ad dot countdown
  useEffect(() => {
    if (phase !== "dot_active") return;
    if (fakeDotTimer <= 0) {
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
        setFakeDotCount(0);
        fakeDotCountRef.current = 0;
        scheduleDotsForFake();
        setPhase("ad");
      }, 1200);
      return;
    }
    const t = setTimeout(() => setFakeDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, fakeDotTimer, onFail, missCount, scheduleDotsForFake]);

  const handleFakeDotTap = () => {
    if (phase !== "dot_active") return;
    const newCount = fakeDotCountRef.current + 1;
    fakeDotCountRef.current = newCount;
    setFakeDotCount(newCount);
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

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */

  const skipCooldown = Math.max(0, Math.ceil(adDuration * 0.85 - (adProgress / 100) * adDuration));
  const isVideoPaused = phase === "dot_active" || phase === "restarting";

  // ── Result overlays ──────────────────────────────
  if (phase === "done") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-4xl">✅</p>
          <p className="font-black text-secondary text-base">{rewardText} Unlocked!</p>
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <X className="w-12 h-12 text-destructive" />
          <p className="font-black text-destructive text-base">Bot detected — access denied</p>
        </div>
      </div>
    );
  }

  // ── Real-ad phase: minimal UI + portal dot ────────
  if (phase === "real_ad") {
    return (
      <>
        {/* Translucent backdrop — visible briefly before Adsgram overlay opens */}
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-4">
          <Loader2 className="w-9 h-9 text-primary animate-spin" />
          <p className="text-sm font-semibold text-white/70">Watch the ad to earn your reward</p>
          {showSuccess && (
            <div className="bg-green-500/20 border border-green-400/50 text-green-300 text-sm font-black px-4 py-1.5 rounded-full animate-bounce">
              ✓ Got it!
            </div>
          )}
        </div>

        {/* ── Red dot rendered at z:999999 — above Adsgram overlay ── */}
        {showPortalDot && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 999999, pointerEvents: "none" }}>
            {/* Countdown badge */}
            <div
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                pointerEvents: "none",
                background: "rgba(0,0,0,0.75)",
                border: "1px solid rgba(239,68,68,0.6)",
                borderRadius: 999,
                padding: "4px 12px",
                color: "#f87171",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 1,
              }}
            >
              TAP RED DOT · {portalDotTimer}s
            </div>

            {/* The dot */}
            <button
              onClick={handlePortalDotTap}
              style={{
                position: "absolute",
                left: `${dotPos.x}%`,
                top: `${dotPos.y}%`,
                transform: "translate(-50%, -50%)",
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#ef4444",
                border: "3px solid white",
                boxShadow: "0 0 0 0 rgba(239,68,68,0.8)",
                animation: "redDotPulse 1s ease-in-out infinite",
                cursor: "pointer",
                pointerEvents: "all",
              }}
              aria-label="Tap the red dot"
            />

            <style>{`
              @keyframes redDotPulse {
                0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.8); }
                70%  { box-shadow: 0 0 0 18px rgba(239,68,68,0); }
                100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
              }
            `}</style>
          </div>,
          document.body
        )}
      </>
    );
  }

  // ── Fallback fake-ad UI ──────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm">
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
          phase === "restarting" ? "border-yellow-500/60" :
          phase === "dot_active" ? "border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.35)]" :
                                   "border-primary/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
              <span className="text-[10px] text-muted-foreground font-semibold">Anti-bot check</span>
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

          {/* Ad body */}
          <div className="relative h-56 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center gap-3 select-none overflow-hidden">
            <div className="absolute top-4 right-4 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-accent/10 rounded-full blur-2xl" />

            <div className={cn(
              "relative text-center space-y-2 transition-all duration-300",
              isVideoPaused ? "blur-md opacity-30 scale-95 pointer-events-none" : ""
            )}>
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">
                PUTITUP
              </div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary inline-block mt-2">
                {rewardText}
              </div>
            </div>

            {phase === "dot_active" && (
              <>
                <div className="absolute inset-0 bg-black/50" />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/70 border border-red-500/60 rounded-full px-3 py-1.5">
                  <span className="text-red-400 text-[11px] font-black">⏸ PAUSED · {fakeDotTimer}s</span>
                </div>
                <button
                  onClick={handleFakeDotTap}
                  style={{
                    position: "absolute",
                    left: `${fakeDotPos.x}%`,
                    top: `${fakeDotPos.y}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 20,
                  }}
                  className="w-12 h-12 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_28px_8px_rgba(239,68,68,0.8)] animate-pulse active:scale-90 transition-transform cursor-pointer"
                  aria-label="Tap the red dot"
                />
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

          {/* Progress bar */}
          {phase === "ad" && (
            <div className="px-4 py-3 space-y-1.5 bg-muted/20">
              <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
                <span>WATCHING AD</span>
                <span>{Math.round(adProgress)}%</span>
              </div>
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-100"
                  style={{ width: `${adProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
