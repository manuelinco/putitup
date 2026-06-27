import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

/*
  FLOW (Adsgram real ad):
  1. showAd() → Adsgram opens its full-screen overlay
  2. We render z-index:2147483647 transparent overlay on top
  3. After dotDelay ms the red dot appears over the ad
  4. 4 seconds to tap the dot:
     - Tapped   → dotClicked=true, dot disappears, wait for ad to finish
     - Not tapped → "blocked" screen covers the ad (dark overlay with message)
  5. showAd() resolves:
     - done=true  + dotClicked=true  → onComplete
     - done=true  + dotClicked=false → onFail
     - done=false (skipped)          → onFail

  FALLBACK (Adsgram not configured / dev):
  showAd() returns false immediately → fake countdown ad with dot overlay
*/

type Phase =
  | "init"         // brief startup
  | "ad_playing"   // ad playing, dot not yet shown (transparent overlay)
  | "dot_active"   // red dot on screen over the ad
  | "dot_clicked"  // dot was tapped, ad still playing (wait for callback)
  | "blocked"      // dot missed → dark block screen over the ad
  | "fake_ad"      // fallback: no Adsgram → fake countdown
  | "fake_dot"     // dot inside fake countdown
  | "done"
  | "failed";

const DOT_WINDOW_S  = 4;
const DOT_DELAY_MIN = 3500;
const DOT_DELAY_MAX = 11000;

const FAKE_AD_DURATION = 25;

function randomDotPos() {
  const margin = 14;
  return {
    x: margin + Math.random() * (100 - margin * 2),
    y: margin + Math.random() * (100 - margin * 2),
  };
}

export function AdChallenge({
  onComplete,
  onFail,
  rewardText = "+10 Tasks",
  adDuration = FAKE_AD_DURATION,
}: AdChallengeProps) {
  const [phase, setPhase] = useState<Phase>("init");
  const phaseRef = useRef<Phase>("init");
  phaseRef.current = phase;

  const [dotPos, setDotPos]     = useState({ x: 50, y: 50 });
  const [dotTimer, setDotTimer] = useState(DOT_WINDOW_S);
  const [showHint, setShowHint] = useState(false);
  const [fakeMode, setFakeMode] = useState(false);

  /* fake-ad state */
  const [fakeProgress, setFakeProgress]   = useState(0);
  const [fakeSkipAvail, setFakeSkipAvail] = useState(false);

  const dotClickedRef  = useRef(false);
  const adResolvedRef  = useRef<boolean | null>(null);
  const dotShownRef    = useRef(false);

  const { showAd } = useAdsgram();

  /* ── helpers ── */
  const completeNow = useCallback(() => {
    setPhase("done");
    setTimeout(() => onComplete(), 450);
  }, [onComplete]);

  const failNow = useCallback(() => {
    setPhase("failed");
    setTimeout(() => onFail(), 800);
  }, [onFail]);

  const showDot = useCallback(() => {
    dotShownRef.current = true;
    setDotPos(randomDotPos());
    setDotTimer(DOT_WINDOW_S);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 1500);
    setPhase("dot_active");
  }, []);

  /* ══════════════════════════════════
     MAIN EFFECT — start Adsgram
  ══════════════════════════════════ */
  useEffect(() => {
    let dotTimeout: ReturnType<typeof setTimeout>;

    const adPromise = showAd();

    /* Give Adsgram 400ms to open its overlay, then switch to ad_playing */
    const initTimeout = setTimeout(() => {
      /* adPromise already resolved (false) → Adsgram not configured → fake ad */
      if (adResolvedRef.current !== null) return;
      setPhase("ad_playing");

      const delay = DOT_DELAY_MIN + Math.random() * (DOT_DELAY_MAX - DOT_DELAY_MIN);
      dotTimeout = setTimeout(() => {
        if (phaseRef.current !== "ad_playing") return;
        showDot();
      }, delay);
    }, 400);

    adPromise.then((done) => {
      adResolvedRef.current = done;
      clearTimeout(dotTimeout);

      if (!done) {
        /* Adsgram not configured OR user skipped → fallback fake ad */
        setFakeMode(true);
        setPhase("fake_ad");
        return;
      }

      /* Ad watched fully */
      if (dotClickedRef.current) {
        completeNow();
      } else if (!dotShownRef.current) {
        /* Dot never appeared (very short ad) → show post-ad challenge */
        showDot();
      } else {
        /* Dot shown but not clicked */
        failNow();
      }
    });

    return () => {
      clearTimeout(initTimeout);
      clearTimeout(dotTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── dot countdown (over real ad) ── */
  useEffect(() => {
    if (phase !== "dot_active") return;
    if (dotTimer <= 0) {
      /* check if ad already resolved */
      if (adResolvedRef.current === true) {
        /* ad finished while dot was active and missed */
        failNow();
      } else {
        /* ad still playing → block it */
        setPhase("blocked");
      }
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, failNow]);

  const handleDotTap = () => {
    if (phase !== "dot_active") return;
    dotClickedRef.current = true;
    if (adResolvedRef.current === true) {
      completeNow();
    } else if (adResolvedRef.current === false) {
      failNow();
    } else {
      /* ad still playing → go transparent, wait */
      setPhase("dot_clicked");
    }
  };

  /* ═══════════════════════════════
     FAKE AD (fallback / dev)
  ═══════════════════════════════ */
  const fakeStartRef  = useRef<number>(0);
  const fakeDotDone   = useRef(false);

  useEffect(() => {
    if (phase !== "fake_ad") return;
    fakeStartRef.current = Date.now();
    fakeDotDone.current  = false;

    /* schedule dot between 25%–70% of ad */
    const dotAt = (adDuration * 1000) * (0.25 + Math.random() * 0.45);

    const iv = setInterval(() => {
      const elapsed  = (Date.now() - fakeStartRef.current) / 1000;
      const progress = Math.min((elapsed / adDuration) * 100, 100);
      setFakeProgress(progress);
      if (progress >= 85) setFakeSkipAvail(true);

      /* trigger dot */
      if (!fakeDotDone.current && elapsed * 1000 >= dotAt && phaseRef.current === "fake_ad") {
        fakeDotDone.current = true;
        clearInterval(iv);
        showDot();
        return;
      }
      if (progress >= 100) {
        clearInterval(iv);
        /* reached end without dot (dot never shown) → show dot now */
        if (!dotShownRef.current) {
          showDot();
        } else if (!dotClickedRef.current) {
          failNow();
        } else {
          completeNow();
        }
      }
    }, 80);

    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* fake dot countdown */
  useEffect(() => {
    if (phase !== "fake_dot") return;
    if (dotTimer <= 0) {
      failNow();
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, failNow]);

  /* ── when dot_active is triggered from fake_ad context ── */
  /* dot_active serves both real-ad and fake-ad overlays */

  /* ═══════════════════════
     RESULT SCREENS
  ═══════════════════════ */
  if (phase === "done") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="w-14 h-14 text-secondary" />
          <p className="font-black text-secondary text-base">{rewardText} Unlocked!</p>
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <X className="w-12 h-12 text-destructive" />
          <p className="font-black text-destructive text-base">Accesso negato</p>
          <p className="text-[11px] text-white/50">Guarda il video e tocca il punto rosso</p>
        </div>
      </div>
    );
  }

  /* ═══════════════════════
     INIT LOADER
  ═══════════════════════ */
  if (phase === "init") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  /* ═══════════════════════
     BLOCKED SCREEN (dot missed while real ad plays)
  ═══════════════════════ */
  if (phase === "blocked") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-5 bg-black/92">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
          <X className="w-10 h-10 text-red-400" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-black text-white text-xl">Video Bloccato</p>
          <p className="text-white/50 text-sm px-8">Non hai toccato il punto rosso in tempo</p>
        </div>
        <button
          onClick={failNow}
          className="mt-2 px-6 py-2.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm font-semibold active:opacity-70"
        >
          Chiudi
        </button>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     OVERLAY (appears on top of Adsgram or fake ad)
     z-index MAX so it floats above the Adsgram player
  ═══════════════════════════════════════════════════════ */
  /* Only use transparent real-ad overlay when NOT in fake mode */
  const isOverAd = !fakeMode && (phase === "ad_playing" || phase === "dot_active" || phase === "dot_clicked");
  const isFakePaused = phase === "dot_active" && adResolvedRef.current === false;

  if (isOverAd) {
    return (
      /* Outer: pointer-events NONE so touches pass through to Adsgram except on the dot */
      <div className="fixed inset-0 z-[2147483647] pointer-events-none">

        {/* Dot active: dim + timer bar + hint + dot */}
        {phase === "dot_active" && (
          <>
            {/* Slight dim so dot is visible over bright video */}
            <div className="absolute inset-0 bg-black/20" />

            {/* Timer bar at top */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-black/40">
              <div
                className={cn(
                  "h-full transition-all duration-1000",
                  dotTimer <= 1 ? "bg-red-500" : "bg-red-400"
                )}
                style={{ width: `${(dotTimer / DOT_WINDOW_S) * 100}%` }}
              />
            </div>

            {/* Hint toast */}
            {showHint && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[12px] font-black px-4 py-1.5 rounded-full border border-red-400/60 whitespace-nowrap pointer-events-none">
                👆 Tocca il punto rosso!
              </div>
            )}

            {/* Countdown badge */}
            <div
              className={cn(
                "absolute top-12 right-4 bg-black/60 border rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums pointer-events-none",
                dotTimer <= 1 ? "border-red-500 text-red-400 animate-pulse" : "border-white/20 text-white/70"
              )}
            >
              {dotTimer}s
            </div>

            {/* Red dot — pointer-events auto so it receives taps */}
            <button
              onClick={handleDotTap}
              style={{
                position: "absolute",
                left: `${dotPos.x}%`,
                top: `${dotPos.y}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
              }}
              className="w-14 h-14 rounded-full bg-red-500 border-[3px] border-white shadow-[0_0_32px_12px_rgba(239,68,68,0.85)] animate-pulse active:scale-90 transition-transform touch-manipulation"
              aria-label="Tocca il punto rosso"
            />
          </>
        )}

        {/* dot_clicked: completely transparent — just waiting for Adsgram callback */}
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     FAKE AD (no Adsgram — dev / fallback)
  ═══════════════════════════════════════════ */
  const skipCooldown = Math.max(0, Math.ceil(adDuration * 0.85 - (fakeProgress / 100) * adDuration));

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm">
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden transition-all duration-300",
          phase === "dot_active"
            ? "border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.35)]"
            : "border-primary/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
            <button
              onClick={() => { if (fakeSkipAvail && phase === "fake_ad") completeNow(); }}
              disabled={!fakeSkipAvail || phase !== "fake_ad"}
              className={cn("text-[10px] font-bold px-2 py-1 rounded-lg transition-all",
                fakeSkipAvail && phase === "fake_ad"
                  ? "text-primary bg-primary/10 border border-primary/30"
                  : "text-muted-foreground/40 cursor-not-allowed"
              )}>
              {fakeSkipAvail && phase === "fake_ad" ? "Skip ›" : `Skip in ${skipCooldown}s`}
            </button>
          </div>

          {/* Video area */}
          <div className="relative h-56 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center select-none overflow-hidden">

            {/* Fake video content */}
            <div className={cn(
              "text-center space-y-2 transition-all duration-300",
              phase === "dot_active" ? "blur-sm opacity-30 pointer-events-none" : ""
            )}>
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">PUTITUP</div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary inline-block">{rewardText}</div>
            </div>

            {/* Red dot overlaid on fake video */}
            {phase === "dot_active" && (
              <>
                <div className="absolute inset-0 bg-black/40" />

                {/* Timer bar */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-black/40">
                  <div
                    className={cn("h-full transition-all duration-1000", dotTimer <= 1 ? "bg-red-500" : "bg-red-400")}
                    style={{ width: `${(dotTimer / DOT_WINDOW_S) * 100}%` }}
                  />
                </div>

                {/* Paused badge */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-black/70 border border-red-500/60 rounded-full px-3 py-1">
                  <span className="text-red-400 text-[11px] font-black">⏸ PAUSED · {dotTimer}s</span>
                </div>

                {/* Hint */}
                {showHint && (
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-[11px] font-black px-3 py-1 rounded-full border border-red-400/50 whitespace-nowrap">
                    👆 Tocca il punto rosso!
                  </div>
                )}

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
                  className="w-14 h-14 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_28px_10px_rgba(239,68,68,0.85)] animate-pulse active:scale-90 transition-transform touch-manipulation"
                  aria-label="Tocca il punto rosso"
                />
              </>
            )}
          </div>

          {/* Progress bar */}
          {(phase === "fake_ad") && (
            <div className="px-4 py-3 space-y-1.5 bg-muted/20">
              <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
                <span>WATCHING AD</span><span>{Math.round(fakeProgress)}%</span>
              </div>
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-100"
                  style={{ width: `${fakeProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
