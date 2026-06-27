import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, X } from "lucide-react";

/*
  ════════════════════════════════════════════════════════════════════
  ANTI-BOT VIDEO AD CHALLENGE  (fully self-contained — our own DOM)
  ════════════════════════════════════════════════════════════════════

  WHY WE DON'T OVERLAY ADSGRAM:
  Adsgram renders its ad inside a full-screen <iframe> injected into
  document.body. An iframe is a separate, cross-origin browser context —
  you CANNOT reliably paint your own HTML on top of it inside a mobile
  WebView (this is by design to stop overlay click-fraud). Every attempt
  to overlay a dot on the Adsgram video fails for this reason.

  SOLUTION:
  We render OUR OWN full-screen animated video ad. The red dot lives in
  the SAME DOM as the video, so it is guaranteed to appear on top.

  EXACT BEHAVIOUR (as requested):
  1. Energy runs out → user taps "Watch ad"
  2. A video starts playing (animated full-screen ad)
  3. At a RANDOM moment + RANDOM position, a red dot appears ON the video
  4. The video FREEZES (blocks) while the dot is up — user must tap it
  5. Tap in time  → video resumes → plays to the end → energy recharges ✅
     No tap in time → video stays blocked → access denied ❌
  ════════════════════════════════════════════════════════════════════
*/

interface AdChallengeProps {
  onComplete: () => void;
  onFail:     () => void;
  rewardText?: string;
}

type Phase = "playing" | "dot" | "done" | "failed";

const VIDEO_MS    = 14_000; // total "video" length
const TICK_MS     = 100;
const DOT_WINDOW  = 6;      // seconds to tap the dot
const DOT_MIN_PCT = 30;     // dot appears between 30%..62% of the video
const DOT_MAX_PCT = 62;

function randomDotPos() {
  const m = 16; // keep dot away from edges (%)
  return {
    x: m + Math.random() * (100 - m * 2),
    y: m + Math.random() * (100 - m * 2),
  };
}

const STYLE_ID = "putitup-ad-keyframes";
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes putitupDot {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.85), 0 0 44px 16px rgba(239,68,68,.7); transform: translate(-50%,-50%) scale(1); }
      50%     { box-shadow: 0 0 0 18px rgba(239,68,68,0), 0 0 70px 30px rgba(239,68,68,.35); transform: translate(-50%,-50%) scale(1.12); }
    }
    @keyframes putitupGradient {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes putitupFloat {
      0%   { transform: translateY(0) translateX(0) scale(1); opacity:.55; }
      50%  { transform: translateY(-26px) translateX(14px) scale(1.15); opacity:.9; }
      100% { transform: translateY(0) translateX(0) scale(1); opacity:.55; }
    }
    @keyframes putitupSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
    @keyframes putitupPop {
      0% { transform: scale(.4); opacity: 0; }
      60%{ transform: scale(1.08); opacity: 1; }
      100%{ transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

export function AdChallenge({ onComplete, onFail, rewardText = "+10 Tasks" }: AdChallengeProps) {
  const [phase, setPhase]       = useState<Phase>("playing");
  const [progress, setProgress] = useState(0);              // 0..100
  const [dotPos, setDotPos]     = useState({ x: 50, y: 50 });
  const [dotSecs, setDotSecs]   = useState(DOT_WINDOW);
  const [showHint, setShowHint] = useState(false);

  const phaseRef    = useRef<Phase>("playing");
  phaseRef.current  = phase;
  const dotDoneRef  = useRef(false);                        // dot already shown+resolved?
  const triggerRef  = useRef(DOT_MIN_PCT + Math.random() * (DOT_MAX_PCT - DOT_MIN_PCT));

  /* inject keyframes once */
  useEffect(() => { ensureKeyframes(); }, []);

  /* ── result helpers ── */
  const succeed = useCallback(() => {
    if (phaseRef.current === "done" || phaseRef.current === "failed") return;
    setPhase("done");
    setTimeout(onComplete, 600);
  }, [onComplete]);

  const failOut = useCallback(() => {
    if (phaseRef.current === "done" || phaseRef.current === "failed") return;
    setPhase("failed");
    setTimeout(onFail, 800);
  }, [onFail]);

  const tapDot = useCallback(() => {
    if (phaseRef.current !== "dot") return;
    dotDoneRef.current = true;
    setPhase("playing"); // video resumes
  }, []);

  /* ══════════════════════════════
     VIDEO PLAYBACK (progress fill)
  ══════════════════════════════ */
  useEffect(() => {
    if (phase !== "playing") return;

    const id = setInterval(() => {
      setProgress((p) => {
        const next = p + (TICK_MS / VIDEO_MS) * 100;

        // Time to show the dot? → freeze the video.
        if (!dotDoneRef.current && next >= triggerRef.current) {
          setDotPos(randomDotPos());
          setDotSecs(DOT_WINDOW);
          setShowHint(true);
          setTimeout(() => setShowHint(false), 2200);
          setPhase("dot");
          return triggerRef.current; // freeze progress here
        }

        // Reached the end (only possible after the dot was tapped).
        if (next >= 100) {
          succeed();
          return 100;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [phase, succeed]);

  /* ══════════════════════════════
     DOT COUNTDOWN (video blocked)
  ══════════════════════════════ */
  useEffect(() => {
    if (phase !== "dot") return;
    if (dotSecs <= 0) { failOut(); return; }
    const t = setTimeout(() => setDotSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotSecs, failOut]);

  /* ══════════════════════════════
     RESULT SCREENS
  ══════════════════════════════ */
  if (phase === "done") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3" style={{ animation: "putitupPop .4s ease-out" }}>
          <CheckCircle2 className="w-20 h-20 text-green-400" />
          <p className="font-black text-green-400 text-xl">{rewardText} sbloccato!</p>
          <p className="text-sm text-white/50">Energia ricaricata</p>
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95">
        <div className="flex flex-col items-center gap-4 text-center px-8" style={{ animation: "putitupPop .35s ease-out" }}>
          <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center border border-red-500/30">
            <X className="w-11 h-11 text-red-400" />
          </div>
          <p className="font-black text-white text-xl">Accesso negato</p>
          <p className="text-sm text-white/50 max-w-[240px]">
            Non hai toccato il punto rosso in tempo. Riprova per ricaricare l'energia.
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════
     THE VIDEO + DOT (playing / dot)
  ══════════════════════════════ */
  const blocked = phase === "dot";

  return (
    <div className="fixed inset-0 z-[2147483647] overflow-hidden bg-black select-none">
      {/* ── Animated "video" content ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(120deg,#1e1b4b,#4c1d95,#7c2d92,#1e3a8a,#0f172a)",
          backgroundSize: "300% 300%",
          animation: blocked ? "none" : "putitupGradient 8s ease infinite",
        }}
      >
        {/* floating orbs */}
        {[
          { s: 150, x: "12%", y: "18%", d: "0s",   c: "rgba(168,85,247,.45)" },
          { s: 110, x: "72%", y: "26%", d: "1.2s", c: "rgba(59,130,246,.40)" },
          { s: 190, x: "60%", y: "68%", d: "0.6s", c: "rgba(236,72,153,.35)" },
          { s: 90,  x: "20%", y: "74%", d: "1.8s", c: "rgba(34,197,94,.30)"  },
        ].map((o, i) => (
          <div
            key={i}
            style={{
              position: "absolute", left: o.x, top: o.y,
              width: o.s, height: o.s, borderRadius: "50%",
              background: o.c, filter: "blur(36px)",
              animation: blocked ? "none" : `putitupFloat ${5 + i}s ease-in-out infinite`,
              animationDelay: o.d,
            }}
          />
        ))}

        {/* center brand */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div
            style={{
              width: 96, height: 96, borderRadius: 28,
              background: "linear-gradient(135deg,#a855f7,#ec4899,#3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 60px rgba(168,85,247,.6)",
              animation: blocked ? "none" : "putitupSpin 9s linear infinite",
            }}
          >
            <span style={{ fontSize: 44 }}>🎯</span>
          </div>
          <div
            className="text-5xl font-black tracking-tight"
            style={{
              background: "linear-gradient(135deg,#fff,#c4b5fd,#93c5fd)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            PUTITUP
          </div>
          <p className="text-white/70 text-sm font-semibold max-w-[260px]">
            Etichetta dati AI · Guadagna crypto reale ogni giorno
          </p>
          <div className="px-5 py-2 rounded-full bg-white/10 border border-white/20 text-white font-bold backdrop-blur-sm">
            {rewardText}
          </div>
        </div>
      </div>

      {/* ── Video chrome: top bar ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/90 bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
          ● AD
        </span>
        <span className="text-[11px] text-white/60 font-semibold bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
          {blocked ? "In pausa — tocca il punto" : "Sponsorizzato"}
        </span>
      </div>

      {/* ── Video chrome: bottom timeline ── */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-8 bg-gradient-to-t from-black/70 to-transparent z-10">
        <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold text-white/60">
          <span>{blocked ? "VIDEO IN PAUSA" : "RIPRODUZIONE..."}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: blocked
                ? "linear-gradient(90deg,#ef4444,#f59e0b)"
                : "linear-gradient(90deg,#a855f7,#ec4899)",
              transition: "width .1s linear",
            }}
          />
        </div>
      </div>

      {/* ── THE RED DOT (only while blocked) ── */}
      {blocked && (
        <>
          {/* dim veil so the dot pops */}
          <div className="absolute inset-0 bg-black/35 z-20 pointer-events-none" />

          {/* badge */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/80 border border-red-500/60 rounded-full px-4 py-2 pointer-events-none">
            <span
              style={{
                width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
                display: "inline-block", animation: "putitupDot 1s infinite",
              }}
            />
            <span className="text-white text-[13px] font-black">Tocca il punto rosso!</span>
            <span
              className="text-[13px] font-black"
              style={{ color: dotSecs <= 2 ? "#ef4444" : "rgba(255,255,255,.6)" }}
            >
              {dotSecs}s
            </span>
          </div>

          {showHint && (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 text-white text-xs font-bold whitespace-nowrap pointer-events-none">
              👆 Toccalo per sbloccare il video!
            </div>
          )}

          {/* the dot itself */}
          <button
            onClick={tapDot}
            aria-label="Tocca il punto rosso"
            style={{
              position: "absolute",
              left: `${dotPos.x}%`,
              top: `${dotPos.y}%`,
              transform: "translate(-50%,-50%)",
              width: 78, height: 78,
              borderRadius: "50%",
              background: "#ef4444",
              border: "4px solid #fff",
              cursor: "pointer",
              zIndex: 40,
              touchAction: "manipulation",
              animation: "putitupDot 1s infinite",
            }}
          />
        </>
      )}
    </div>
  );
}
