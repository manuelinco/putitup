import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { useAdsgram } from "@/hooks/use-adsgram";

/*
  FLOW:
  ──────────────────────────────────────────────────────────────────
  1. showAd() → Adsgram opens its overlay (injected into document.body)
  2. After ~1 s we append OUR portal container to document.body
     → our container is AFTER Adsgram's div in the DOM
     → same z-index wins by DOM order → our dot is on top
  3. Red dot appears at a random position (4–10 s into the ad)
  4. User taps dot → completeNow() immediately
  5. Dot not tapped / timer 0 → failNow()
  6. If Adsgram resolves before dot appears:
       done=true  → show dot post-ad on plain dark screen
       done=false (skipped quickly) → fake countdown fallback
  ──────────────────────────────────────────────────────────────────
  FAKE FALLBACK (no Adsgram / immediate done=false):
  Show a fake countdown, dot appears 4–10 s in, same dot/tap logic.
*/

interface AdChallengeProps {
  onComplete: () => void;
  onFail:     () => void;
  rewardText?: string;
}

type Step =
  | "loading"
  | "watching"       // real Adsgram playing
  | "dot_over_ad"    // dot injected over Adsgram (portal in body)
  | "dot_post"       // dot on plain dark screen (post-ad)
  | "fake_countdown" // no Adsgram fallback
  | "done"
  | "failed";

const DOT_SECS       = 6;
const DOT_DELAY_MIN  = 4_000;   // ms after ad starts
const DOT_DELAY_MAX  = 10_000;
const FAKE_DURATION  = 20_000;  // ms

function randomPos() {
  const m = 18;
  return {
    x: m + Math.random() * (100 - m * 2),
    y: m + Math.random() * (100 - m * 2),
  };
}

/* ── Pulse keyframes injected once ── */
const STYLE_ID = "ad-dot-keyframes";
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes adDotPulse {
      0%,100%{ box-shadow:0 0 0 0 rgba(239,68,68,0.9),0 0 40px 18px rgba(239,68,68,0.7); }
      50%     { box-shadow:0 0 0 14px rgba(239,68,68,0),0 0 60px 26px rgba(239,68,68,0.4); }
    }
  `;
  document.head.appendChild(s);
}

export function AdChallenge({ onComplete, onFail, rewardText = "+10 Tasks" }: AdChallengeProps) {
  const [step, setStep]           = useState<Step>("loading");
  const [dotPos, setDotPos]       = useState({ x: 50, y: 50 });
  const [dotSecs, setDotSecs]     = useState(DOT_SECS);
  const [showHint, setShowHint]   = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);

  const stepRef       = useRef<Step>("loading");
  stepRef.current     = step;
  const adStartRef    = useRef(Date.now());
  const portalRef     = useRef<HTMLDivElement | null>(null);

  const { showAd } = useAdsgram();

  /* ── Portal container ── */
  const [portalMounted, setPortalMounted] = useState(false);
  useEffect(() => {
    ensureKeyframes();
    const el = document.createElement("div");
    el.id = "ad-challenge-portal";
    portalRef.current = el;
    return () => {
      if (document.body.contains(el)) document.body.removeChild(el);
    };
  }, []);

  const mountPortal = useCallback(() => {
    const el = portalRef.current;
    if (!el || document.body.contains(el)) return;
    document.body.appendChild(el); // appended AFTER Adsgram's div → wins z-index battle
    setPortalMounted(true);
  }, []);

  /* ── Result helpers ── */
  const finish = useCallback(() => {
    setStep("done");
    // Remove portal
    const el = portalRef.current;
    if (el && document.body.contains(el)) document.body.removeChild(el);
    setPortalMounted(false);
    setTimeout(onComplete, 400);
  }, [onComplete]);

  const fail = useCallback(() => {
    setStep("failed");
    const el = portalRef.current;
    if (el && document.body.contains(el)) document.body.removeChild(el);
    setPortalMounted(false);
    setTimeout(onFail, 700);
  }, [onFail]);

  const showDotNow = useCallback((which: "dot_over_ad" | "dot_post") => {
    mountPortal();
    setDotPos(randomPos());
    setDotSecs(DOT_SECS);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 2500);
    setStep(which);
  }, [mountPortal]);

  const tapDot = useCallback(() => {
    if (stepRef.current !== "dot_over_ad" && stepRef.current !== "dot_post") return;
    finish();
  }, [finish]);

  /* ══════════════════════════════════════
     1. Start Adsgram + schedule dot
  ══════════════════════════════════════ */
  useEffect(() => {
    setStep("watching");
    adStartRef.current = Date.now();

    let dotTimeout: ReturnType<typeof setTimeout>;
    let adResolved = false;

    /* Schedule dot to appear DURING the ad */
    const initDelay = setTimeout(() => {
      const delay = DOT_DELAY_MIN + Math.random() * (DOT_DELAY_MAX - DOT_DELAY_MIN);
      dotTimeout = setTimeout(() => {
        if (!adResolved && stepRef.current === "watching") {
          showDotNow("dot_over_ad");
        }
      }, delay);
    }, 800); // give Adsgram 800ms to open its overlay first

    showAd().then((done) => {
      adResolved = true;
      clearTimeout(dotTimeout);

      const elapsed = Date.now() - adStartRef.current;
      const wasInstant = elapsed < 600; // no real ad → resolved instantly

      if (wasInstant || !done) {
        /* Adsgram not configured OR user skipped very quickly → fake fallback */
        if (stepRef.current === "watching") {
          setStep("fake_countdown");
        } else if (stepRef.current === "dot_over_ad") {
          /* dot appeared but ad was skipped — dot is already showing, let user tap */
        } else {
          fail();
        }
        return;
      }

      /* done=true → full ad watched */
      if (stepRef.current === "dot_over_ad") {
        /* dot appeared during ad — keep it visible, user must tap */
        /* nothing to do: the dot countdown handles it */
        return;
      }
      if (stepRef.current === "watching") {
        /* dot never appeared → show post-ad */
        showDotNow("dot_post");
        return;
      }
      /* already tapped (done/failed) → ignore */
    });

    return () => {
      clearTimeout(initDelay);
      clearTimeout(dotTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ══════════════════
     2. Dot countdown
  ══════════════════ */
  useEffect(() => {
    if (step !== "dot_over_ad" && step !== "dot_post") return;
    if (dotSecs <= 0) { fail(); return; }
    const t = setTimeout(() => setDotSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, dotSecs, fail]);

  /* ══════════════════════════════
     3. Fake countdown (no Adsgram)
  ══════════════════════════════ */
  useEffect(() => {
    if (step !== "fake_countdown") return;

    const start = Date.now();
    const dotDelay = DOT_DELAY_MIN + Math.random() * (DOT_DELAY_MAX - DOT_DELAY_MIN);

    const progInterval = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / FAKE_DURATION) * 100, 100);
      setFakeProgress(pct);
      if (pct >= 100) {
        clearInterval(progInterval);
        if (stepRef.current === "fake_countdown") showDotNow("dot_post");
      }
    }, 100);

    const dotTimer = setTimeout(() => {
      if (stepRef.current === "fake_countdown") showDotNow("dot_post");
    }, dotDelay);

    return () => { clearInterval(progInterval); clearTimeout(dotTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ══════════════════
     RENDER
  ══════════════════ */

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

  /* ── Portal dot (over Adsgram OR over fake countdown) ── */
  const DotPortal = portalRef.current && portalMounted && (step === "dot_over_ad" || step === "dot_post")
    ? createPortal(
        <div style={{
          position: "fixed", inset: 0, zIndex: 2147483647,
          pointerEvents: "none",
          // Slight dim when over real ad
          background: step === "dot_post" ? "#000" : "rgba(0,0,0,0.25)",
        }}>
          {/* Timer bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.1)" }}>
            <div style={{
              height: "100%",
              width: `${(dotSecs / DOT_SECS) * 100}%`,
              background: dotSecs <= 2 ? "#ef4444" : "#a855f7",
              transition: "width 1s linear",
            }} />
          </div>

          {/* Badge */}
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.8)", border: "1px solid rgba(239,68,68,0.6)",
            borderRadius: 999, padding: "6px 18px",
            pointerEvents: "none",
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
              boxShadow: "0 0 0 0 rgba(239,68,68,0.7)",
              animation: "adDotPulse 1s infinite",
              display: "inline-block",
            }} />
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>Tocca il punto rosso!</span>
            <span style={{
              fontSize: 13, fontWeight: 900,
              color: dotSecs <= 2 ? "#ef4444" : "rgba(255,255,255,0.6)",
            }}>{dotSecs}s</span>
          </div>

          {/* Hint */}
          {showHint && (
            <div style={{
              position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.12)", color: "#fff",
              fontSize: 12, fontWeight: 700,
              padding: "6px 16px", borderRadius: 999, whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.2)",
              pointerEvents: "none",
            }}>
              👆 Tocca il punto rosso per continuare!
            </div>
          )}

          {/* Red dot — pointer-events auto */}
          <button
            onClick={tapDot}
            style={{
              position: "absolute",
              left: `${dotPos.x}%`,
              top:  `${dotPos.y}%`,
              transform: "translate(-50%, -50%)",
              width: 72, height: 72,
              borderRadius: "50%",
              background: "#ef4444",
              border: "4px solid white",
              cursor: "pointer",
              pointerEvents: "auto",
              animation: "adDotPulse 1s infinite",
              zIndex: 1,
              touchAction: "manipulation",
            }}
            aria-label="Tocca il punto rosso"
          />
        </div>,
        portalRef.current
      )
    : null;

  /* ── Invisible overlay while watching real Adsgram ── */
  if (step === "loading" || step === "watching") {
    return (
      <>
        {DotPortal}
        <div className="fixed inset-0 z-[50] flex items-end justify-center pb-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/60 rounded-full px-4 py-2 border border-white/10">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-[11px] text-white/50 font-semibold">Caricamento annuncio…</span>
          </div>
        </div>
      </>
    );
  }

  /* ── Post-ad dot (black screen) ── */
  if (step === "dot_post") {
    return (
      <>
        {DotPortal}
        <div className="fixed inset-0 z-[100] bg-black pointer-events-none" />
      </>
    );
  }

  /* ── Dot over ad (portal handles everything, React layer is transparent) ── */
  if (step === "dot_over_ad") {
    return <>{DotPortal}</>;
  }

  /* ── Fake countdown ── */
  return (
    <>
      {DotPortal}
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 p-4">
        <div className="w-full max-w-sm space-y-4">
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
            ⚠️ Rimani attento — apparirà un punto rosso!
          </p>
        </div>
      </div>
    </>
  );
}
