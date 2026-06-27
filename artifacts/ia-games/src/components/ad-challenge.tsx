import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

/*
  FLOW (Real Adsgram):
  1. showAd() → Adsgram opens its full-screen DOM overlay
  2. After ~1s we switch to "ad_playing" phase
  3. After DOT_DELAY_MIN–MAX ms the red dot appears ON TOP of Adsgram
     (z-index 2147483647 – our overlay is above the Adsgram div)
  4. User has DOT_WINDOW_S seconds to tap:
     - Tapped   → completeNow() immediately (don't wait for ad to finish)
     - Not tapped / timer 0 → mark as missed; when ad finishes → fail
       OR if ad finishes before dot appears → show dot post-ad
  5. Adsgram promise resolves (done=false → fake fallback)

  FLOW (Fake ad – Adsgram not available / returns false):
  1. Fake countdown video
  2. Red dot appears during countdown
  3. Tap → completeNow() immediately
  4. Miss → failNow()

  KEY RULE: tapping the dot ALWAYS succeeds regardless of mode.
*/

type Phase =
  | "init"
  | "ad_playing"
  | "dot_active"
  | "dot_tapped"
  | "fake_ad"
  | "done"
  | "failed";

const DOT_WINDOW_S   = 6;    // seconds the dot stays on screen
const DOT_DELAY_MIN  = 4000; // ms into ad before dot appears (min)
const DOT_DELAY_MAX  = 10000; // ms into ad before dot appears (max)
const FAKE_AD_DURATION = 25;  // seconds for the fallback fake ad

function randomDotPos() {
  const margin = 15;
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

  const [fakeProgress, setFakeProgress]   = useState(0);
  const [fakeSkipAvail, setFakeSkipAvail] = useState(false);

  const dotShownRef   = useRef(false);
  const dotTappedRef  = useRef(false);
  const adDoneRef     = useRef<boolean | null>(null);
  const fakeDotDone   = useRef(false);
  const fakeStartRef  = useRef(0);

  const { showAd } = useAdsgram();

  const completeNow = useCallback(() => {
    setPhase("done");
    setTimeout(() => onComplete(), 400);
  }, [onComplete]);

  const failNow = useCallback(() => {
    setPhase("failed");
    setTimeout(() => onFail(), 700);
  }, [onFail]);

  const showDot = useCallback(() => {
    dotShownRef.current = true;
    setDotPos(randomDotPos());
    setDotTimer(DOT_WINDOW_S);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 2000);
    setPhase("dot_active");
  }, []);

  /* ══════════════════════════════════
     START — launch Adsgram
  ══════════════════════════════════ */
  useEffect(() => {
    let dotTimeout: ReturnType<typeof setTimeout>;

    const adPromise = showAd();

    /* After 1s, switch to ad_playing and schedule the dot */
    const initTimer = setTimeout(() => {
      if (adDoneRef.current !== null) return; // ad already resolved (no Adsgram)
      setPhase("ad_playing");

      const delay = DOT_DELAY_MIN + Math.random() * (DOT_DELAY_MAX - DOT_DELAY_MIN);
      dotTimeout = setTimeout(() => {
        if (phaseRef.current !== "ad_playing") return;
        showDot();
      }, delay);
    }, 1000);

    adPromise.then((done) => {
      adDoneRef.current = done;
      clearTimeout(dotTimeout);

      if (!done) {
        /* Adsgram not configured or user skipped → fake ad */
        setFakeMode(true);
        setPhase("fake_ad");
        return;
      }

      /* Ad finished (done=true) */
      if (dotTappedRef.current) {
        /* Dot was tapped before ad ended — already completed */
        return;
      }
      if (!dotShownRef.current) {
        /* Dot never appeared (very fast ad) → show post-ad */
        showDot();
      } else {
        /* Dot appeared but was not tapped → fail */
        failNow();
      }
    });

    return () => {
      clearTimeout(initTimer);
      clearTimeout(dotTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Dot countdown ── */
  useEffect(() => {
    if (phase !== "dot_active") return;
    if (dotTimer <= 0) {
      /* Dot window expired without tap */
      if (adDoneRef.current === null) {
        /* Ad still playing → fail immediately (dot was visible, missed) */
        failNow();
      } else {
        failNow();
      }
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, failNow]);

  /* Tapping the dot ALWAYS succeeds */
  const handleDotTap = useCallback(() => {
    if (phase !== "dot_active") return;
    dotTappedRef.current = true;
    completeNow();
  }, [phase, completeNow]);

  /* ═══════════════════════════════
     FAKE AD (no Adsgram)
  ═══════════════════════════════ */
  useEffect(() => {
    if (phase !== "fake_ad") return;
    fakeStartRef.current = Date.now();
    fakeDotDone.current = false;
    dotShownRef.current = false;

    const dotAt = (adDuration * 1000) * (0.25 + Math.random() * 0.45);

    const iv = setInterval(() => {
      const elapsed  = (Date.now() - fakeStartRef.current) / 1000;
      const progress = Math.min((elapsed / adDuration) * 100, 100);
      setFakeProgress(progress);
      if (progress >= 85) setFakeSkipAvail(true);

      if (!fakeDotDone.current && elapsed * 1000 >= dotAt && phaseRef.current === "fake_ad") {
        fakeDotDone.current = true;
        clearInterval(iv);
        showDot();
        return;
      }

      if (progress >= 100) {
        clearInterval(iv);
        if (!fakeDotDone.current) {
          showDot(); // safety: show dot if never triggered
        } else {
          failNow();
        }
      }
    }, 80);

    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ═══════════════
     RESULT SCREENS
  ═══════════════ */
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
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-9 h-9 text-red-400" />
          </div>
          <div className="space-y-1">
            <p className="font-black text-white text-lg">Accesso negato</p>
            <p className="text-[12px] text-white/50">Non hai toccato il punto rosso in tempo</p>
          </div>
        </div>
      </div>
    );
  }

  /* "dot_tapped" is unused but kept as a safety phase */

  /* ══════════════════════════════════
     INIT (brief loader before Adsgram opens)
  ══════════════════════════════════ */
  if (phase === "init") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 rounded-full px-4 py-2 border border-white/10">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <span className="text-[11px] text-white/60 font-semibold">Caricamento annuncio…</span>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     REAL AD OVERLAY (ad_playing + dot_active)
     pointer-events:none on container → touches pass through
     to Adsgram, EXCEPT on the dot button itself.
     z-index 2147483647 → appears above Adsgram's DOM overlay.
  ══════════════════════════════════════════════════════ */
  if (!fakeMode && (phase === "ad_playing" || phase === "dot_active")) {
    return (
      <div className="fixed inset-0 z-[2147483647] pointer-events-none">

        {phase === "dot_active" && (
          <>
            {/* Slight dim to make dot visible over bright video */}
            <div className="absolute inset-0 bg-black/25" />

            {/* Timer bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-black/40">
              <div
                className={cn("h-full transition-all duration-1000",
                  dotTimer <= 2 ? "bg-red-500 animate-pulse" : "bg-red-400")}
                style={{ width: `${(dotTimer / DOT_WINDOW_S) * 100}%` }}
              />
            </div>

            {/* Top instruction badge */}
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <div className="flex items-center gap-2 bg-black/70 border border-red-500/60 rounded-full px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute" />
                <span className="w-2 h-2 rounded-full bg-red-500 relative" />
                <span className="text-white text-[12px] font-black ml-1">Tocca il punto rosso!</span>
                <span className={cn("text-[12px] font-black tabular-nums",
                  dotTimer <= 2 ? "text-red-400" : "text-white/70"
                )}>{dotTimer}s</span>
              </div>
            </div>

            {/* Bounce hint */}
            {showHint && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[11px] font-black px-4 py-1.5 rounded-full border border-red-400/50 whitespace-nowrap animate-bounce pointer-events-none">
                👆 Tocca il punto rosso!
              </div>
            )}

            {/* Red dot — pointer-events:auto so it receives taps */}
            <button
              onClick={handleDotTap}
              style={{
                position: "absolute",
                left: `${dotPos.x}%`,
                top: `${dotPos.y}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
              }}
              className="w-16 h-16 rounded-full bg-red-500 border-[4px] border-white shadow-[0_0_50px_20px_rgba(239,68,68,0.9)] animate-pulse active:scale-90 transition-transform touch-manipulation"
              aria-label="Tocca il punto rosso"
            />
          </>
        )}

        {/* ad_playing: completely transparent — Adsgram visible underneath */}
      </div>
    );
  }

  /* ════════════════════════════════════════
     FAKE AD + dot overlay
  ════════════════════════════════════════ */
  const skipCooldown = Math.max(0, Math.ceil(adDuration * 0.85 - (fakeProgress / 100) * adDuration));

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm">
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden",
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

            <div className={cn(
              "text-center space-y-2 transition-all duration-300",
              phase === "dot_active" ? "blur-sm opacity-20 pointer-events-none" : ""
            )}>
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">PUTITUP</div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary inline-block">{rewardText}</div>
            </div>

            {phase === "dot_active" && (
              <>
                <div className="absolute inset-0 bg-black/50" />

                <div className="absolute top-0 left-0 right-0 h-[3px] bg-black/40">
                  <div
                    className={cn("h-full transition-all duration-1000",
                      dotTimer <= 2 ? "bg-red-500 animate-pulse" : "bg-red-400")}
                    style={{ width: `${(dotTimer / DOT_WINDOW_S) * 100}%` }}
                  />
                </div>

                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-black/80 border border-red-500/60 rounded-full px-3 py-1">
                  <span className="text-red-400 text-[11px] font-black">⏸ PAUSED · {dotTimer}s</span>
                </div>

                {showHint && (
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white text-[11px] font-black px-3 py-1.5 rounded-full border border-red-400/50 whitespace-nowrap animate-bounce">
                    👆 Tocca il punto rosso!
                  </div>
                )}

                <button
                  onClick={handleDotTap}
                  style={{
                    position: "absolute",
                    left: `${dotPos.x}%`,
                    top: `${dotPos.y}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 20,
                  }}
                  className="w-14 h-14 rounded-full bg-red-500 border-[3px] border-white/90 shadow-[0_0_30px_12px_rgba(239,68,68,0.9)] animate-pulse active:scale-90 transition-transform touch-manipulation"
                  aria-label="Tocca il punto rosso"
                />
              </>
            )}
          </div>

          {phase === "fake_ad" && (
            <div className="px-4 py-3 space-y-1.5 bg-muted/20">
              <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
                <span>WATCHING AD</span>
                <span>{Math.round(fakeProgress)}%</span>
              </div>
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-100"
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
