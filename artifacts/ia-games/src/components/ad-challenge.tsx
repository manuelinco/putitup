import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
}

/*
  FLOW:
  1. Adsgram starts (or instantly falls back if not available)
  2a. If Adsgram done=true  → dot challenge on dark screen
  2b. If Adsgram done=false → 20s fake-ad countdown, dot appears 5-15s in
  3. Dot: 6 seconds, tap = success, timeout = fail
*/

type Step = "loading" | "watching" | "fake_countdown" | "dot" | "done" | "failed";

const DOT_SECS = 6;

function randomPos() {
  const m = 18;
  return {
    x: m + Math.random() * (100 - m * 2),
    y: m + Math.random() * (100 - m * 2),
  };
}

export function AdChallenge({ onComplete, onFail, rewardText = "+10 Tasks" }: AdChallengeProps) {
  const [step, setStep]         = useState<Step>("loading");
  const [dotPos, setDotPos]     = useState({ x: 50, y: 50 });
  const [dotSecs, setDotSecs]   = useState(DOT_SECS);
  const [showHint, setShowHint] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);

  const stepRef = useRef<Step>("loading");
  stepRef.current = step;

  const { showAd } = useAdsgram();

  const finish = useCallback(() => {
    setStep("done");
    setTimeout(onComplete, 400);
  }, [onComplete]);

  const fail = useCallback(() => {
    setStep("failed");
    setTimeout(onFail, 700);
  }, [onFail]);

  const showDot = useCallback(() => {
    setDotPos(randomPos());
    setDotSecs(DOT_SECS);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 2500);
    setStep("dot");
  }, []);

  /* ── Start Adsgram ── */
  useEffect(() => {
    setStep("watching");
    showAd().then((done) => {
      if (done) {
        showDot();
      } else {
        setStep("fake_countdown");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fake countdown + dot scheduling ── */
  useEffect(() => {
    if (step !== "fake_countdown") return;

    const DURATION = 20_000; // 20 s
    const DOT_MIN  = 4_000;  // earliest dot: 4 s
    const DOT_MAX  = 12_000; // latest dot: 12 s
    const dotDelay = DOT_MIN + Math.random() * (DOT_MAX - DOT_MIN);

    const start = Date.now();

    /* progress bar */
    const progInterval = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / DURATION) * 100, 100);
      setFakeProgress(pct);
      if (pct >= 100) {
        clearInterval(progInterval);
        /* if dot was never shown (shouldn't happen), show now */
        if (stepRef.current === "fake_countdown") showDot();
      }
    }, 100);

    /* dot appears at random time */
    const dotTimer = setTimeout(() => {
      if (stepRef.current === "fake_countdown") showDot();
    }, dotDelay);

    return () => {
      clearInterval(progInterval);
      clearTimeout(dotTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ── Dot countdown ── */
  useEffect(() => {
    if (step !== "dot") return;
    if (dotSecs <= 0) { fail(); return; }
    const t = setTimeout(() => setDotSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, dotSecs, fail]);

  const tapDot = useCallback(() => {
    if (step !== "dot") return;
    finish();
  }, [step, finish]);

  /* ════════════════ RENDER ════════════════ */

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="w-16 h-16 text-green-400" />
          <p className="font-black text-green-400 text-lg">{rewardText} Sbloccato!</p>
        </div>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-9 h-9 text-red-400" />
          </div>
          <p className="font-black text-white text-lg">Accesso negato</p>
          <p className="text-sm text-white/50">Tocca il punto rosso entro il tempo</p>
        </div>
      </div>
    );
  }

  /* Loading / Watching real Adsgram (nearly invisible, passes touches through) */
  if (step === "loading" || step === "watching") {
    return (
      <div className="fixed inset-0 z-[500] flex items-end justify-center pb-10 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 rounded-full px-4 py-2 border border-white/10">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="text-[11px] text-white/50 font-semibold">Caricamento…</span>
        </div>
      </div>
    );
  }

  /* ══ DOT CHALLENGE (full-screen dark — used after real Adsgram AND during fake) ══ */
  if (step === "dot") {
    return (
      <div className="fixed inset-0 z-[2147483647] bg-black">
        {/* Timer bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className={cn("h-full transition-all duration-1000",
              dotSecs <= 2 ? "bg-red-500 animate-pulse" : "bg-primary")}
            style={{ width: `${(dotSecs / DOT_SECS) * 100}%` }}
          />
        </div>

        {/* Top label */}
        <div className="absolute top-5 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-2 bg-black/80 border border-red-500/60 rounded-full px-5 py-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-white text-[13px] font-black">Tocca il punto rosso!</span>
            <span className={cn("text-[13px] font-black tabular-nums",
              dotSecs <= 2 ? "text-red-400 animate-pulse" : "text-white/60"
            )}>{dotSecs}s</span>
          </div>
        </div>

        {/* Hint */}
        {showHint && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white/10 text-white text-[12px] font-bold px-4 py-1.5 rounded-full border border-white/20 whitespace-nowrap animate-bounce">
            👆 Tocca il punto rosso per continuare!
          </div>
        )}

        {/* Red dot — the only interactive element */}
        <button
          onClick={tapDot}
          style={{
            position: "absolute",
            left: `${dotPos.x}%`,
            top:  `${dotPos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
          className="w-20 h-20 rounded-full bg-red-500 border-[4px] border-white shadow-[0_0_60px_25px_rgba(239,68,68,0.95)] animate-pulse active:scale-90 transition-transform touch-manipulation z-10"
          aria-label="Tocca il punto rosso"
        />
      </div>
    );
  }

  /* ══ FAKE COUNTDOWN (when Adsgram not available) ══ */
  /* Dot will interrupt this and switch to "dot" step automatically */
  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Ad card */}
        <div className="relative bg-card border border-primary/40 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.2)]">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
            <span className="text-[10px] text-muted-foreground/60 font-semibold">Sponsored</span>
          </div>

          <div className="h-52 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center gap-3">
            <div className="text-5xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">
              PUTITUP
            </div>
            <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
            <div className="px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-sm font-bold text-primary">
              {rewardText}
            </div>
          </div>

          <div className="px-4 py-3 space-y-1.5 bg-muted/20">
            <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
              <span>WATCHING AD</span>
              <span>{Math.round(fakeProgress)}%</span>
            </div>
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-100"
                style={{ width: `${fakeProgress}%` }}
              />
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/30 font-semibold">
          Stai attento — il punto rosso apparirà da un momento all'altro!
        </p>
      </div>
    </div>
  );
}
