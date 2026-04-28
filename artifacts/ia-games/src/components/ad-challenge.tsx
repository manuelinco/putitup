import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Volume2 } from "lucide-react";

interface AdChallengeProps {
  onComplete: () => void;
  onFail: () => void;
  rewardText?: string;
  adDuration?: number;
}

type ChallengeType = "dot" | "word";
type Phase = "ad" | "dot_challenge" | "word_challenge" | "done" | "failed";

const WORD_CHALLENGES = [
  { partial: "DO_", options: ["G", "T", "R"], answer: "G", full: "DOG" },
  { partial: "CA_", options: ["T", "P", "R"], answer: "T", full: "CAT" },
  { partial: "SU_", options: ["N", "M", "B"], answer: "N", full: "SUN" },
  { partial: "RE_", options: ["D", "G", "P"], answer: "D", full: "RED" },
  { partial: "BI_", options: ["G", "D", "T"], answer: "G", full: "BIG" },
  { partial: "RU_", options: ["N", "G", "T"], answer: "N", full: "RUN" },
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function AdChallenge({ onComplete, onFail, rewardText = "+10 Tasks", adDuration = 20 }: AdChallengeProps) {
  const [phase, setPhase] = useState<Phase>("ad");
  const [adProgress, setAdProgress] = useState(0);
  const [dotPos, setDotPos] = useState({ x: 50, y: 50 });
  const [dotTimer, setDotTimer] = useState(3);
  const [wordChallenge, setWordChallenge] = useState(WORD_CHALLENGES[0]);
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [wordTimer, setWordTimer] = useState(5);
  const [challengesScheduled, setChallengesScheduled] = useState<number[]>([]);
  const [challengesDone, setChallengesDone] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [skipAvailable, setSkipAvailable] = useState(false);

  const adStartRef = useRef(Date.now());
  const phaseRef = useRef<Phase>("ad");
  const challengesDoneRef = useRef(0);
  const scheduledRef = useRef<number[]>([]);

  phaseRef.current = phase;
  challengesDoneRef.current = challengesDone;

  const triggerDotChallenge = useCallback(() => {
    const x = 15 + Math.random() * 70;
    const y = 20 + Math.random() * 60;
    setDotPos({ x, y });
    setDotTimer(3);
    setPhase("dot_challenge");
  }, []);

  const triggerWordChallenge = useCallback(() => {
    const wc = WORD_CHALLENGES[Math.floor(Math.random() * WORD_CHALLENGES.length)];
    setWordChallenge(wc);
    setWordOptions(shuffle(wc.options));
    setWordTimer(5);
    setPhase("word_challenge");
  }, []);

  const triggerChallenge = useCallback(() => {
    const types: ChallengeType[] = ["dot", "word"];
    const type = types[Math.floor(Math.random() * types.length)];
    if (type === "dot") {
      triggerDotChallenge();
    } else {
      triggerWordChallenge();
    }
  }, [triggerDotChallenge, triggerWordChallenge]);

  useEffect(() => {
    const t1 = Math.floor(adDuration * 0.35);
    const t2 = Math.floor(adDuration * 0.70);
    setChallengesScheduled([t1, t2]);
    scheduledRef.current = [t1, t2];
  }, [adDuration]);

  useEffect(() => {
    if (phase !== "ad") return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - adStartRef.current) / 1000;
      const progress = Math.min((elapsed / adDuration) * 100, 100);
      setAdProgress(progress);

      if (progress >= 85) setSkipAvailable(true);

      const elapsedSec = Math.floor(elapsed);
      const pending = scheduledRef.current;
      if (pending.length > 0 && elapsedSec >= pending[0] && challengesDoneRef.current < 2) {
        scheduledRef.current = pending.slice(1);
        clearInterval(interval);
        triggerChallenge();
        return;
      }

      if (progress >= 100) {
        clearInterval(interval);
        setPhase("done");
        setTimeout(() => onComplete(), 400);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [phase, adDuration, triggerChallenge, onComplete]);

  useEffect(() => {
    if (phase !== "dot_challenge") return;
    if (dotTimer <= 0) {
      setPhase("failed");
      setTimeout(() => onFail(), 600);
      return;
    }
    const t = setTimeout(() => setDotTimer((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, dotTimer, onFail]);

  useEffect(() => {
    if (phase !== "word_challenge") return;
    if (wordTimer <= 0) {
      setPhase("failed");
      setTimeout(() => onFail(), 600);
      return;
    }
    const t = setTimeout(() => setWordTimer((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, wordTimer, onFail]);

  const handleDotTap = () => {
    if (phase !== "dot_challenge") return;
    setFeedbackText("✓ Got it!");
    setChallengesDone((c) => c + 1);
    adStartRef.current = Date.now() - (adProgress / 100) * adDuration * 1000;
    setPhase("ad");
  };

  const handleWordOption = (opt: string) => {
    if (phase !== "word_challenge") return;
    if (opt === wordChallenge.answer) {
      setFeedbackText(`✓ ${wordChallenge.full}!`);
      setChallengesDone((c) => c + 1);
      adStartRef.current = Date.now() - (adProgress / 100) * adDuration * 1000;
      setPhase("ad");
    } else {
      setPhase("failed");
      setTimeout(() => onFail(), 600);
    }
  };

  const handleSkip = () => {
    if (!skipAvailable) return;
    setPhase("done");
    setTimeout(() => onComplete(), 200);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm relative">

        {/* Ad container */}
        <div className={cn(
          "relative bg-card border rounded-2xl overflow-hidden transition-all",
          phase === "failed" ? "border-destructive shadow-[0_0_30px_rgba(239,68,68,0.4)]" :
          phase === "done" ? "border-secondary shadow-[0_0_30px_rgba(74,222,128,0.4)]" :
          "border-primary/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
        )}>

          {/* Ad header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AD</span>
              <Volume2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-semibold">Sponsored</span>
            </div>
            <button
              onClick={handleSkip}
              disabled={!skipAvailable}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-lg transition-all",
                skipAvailable
                  ? "text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20"
                  : "text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              {skipAvailable ? "Skip ›" : `Skip in ${Math.ceil((adDuration * 0.85) - (adProgress / 100) * adDuration)}s`}
            </button>
          </div>

          {/* Ad body */}
          <div className="relative h-52 bg-gradient-to-br from-primary/20 via-card to-accent/10 flex flex-col items-center justify-center gap-3 select-none">
            {/* Background decoration */}
            <div className="absolute top-4 right-4 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-accent/10 rounded-full blur-2xl" />

            {/* Brand content */}
            <div className="relative text-center space-y-2">
              <div className="text-4xl font-black bg-gradient-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">
                PUTITUP
              </div>
              <p className="text-xs text-muted-foreground font-semibold">Label AI Data · Earn Real Crypto</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-xs font-bold text-primary">
                  {rewardText}
                </div>
              </div>
            </div>

            {/* Dot challenge overlay */}
            {phase === "dot_challenge" && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-start justify-center pt-2">
                <div className="bg-card/90 border border-primary/40 rounded-xl px-3 py-1.5 text-center">
                  <p className="text-[10px] font-black text-primary uppercase tracking-wider">
                    TAP THE DOT · {dotTimer}s
                  </p>
                </div>
                <button
                  onClick={handleDotTap}
                  style={{
                    position: "absolute",
                    left: `${dotPos.x}%`,
                    top: `${dotPos.y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  className={cn(
                    "w-14 h-14 rounded-full border-4 border-white/80 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]",
                    "animate-pulse hover:scale-110 active:scale-95 transition-transform",
                    "flex items-center justify-center cursor-pointer z-10"
                  )}
                >
                  <span className="text-white font-black text-sm">{dotTimer}</span>
                </button>
              </div>
            )}

            {/* Word challenge overlay */}
            {phase === "word_challenge" && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 px-4">
                <div className="text-center space-y-1">
                  <p className="text-[10px] font-black text-primary uppercase tracking-wider">
                    Complete the word · {wordTimer}s
                  </p>
                  <p className="text-3xl font-black tracking-[0.3em] text-white">
                    {wordChallenge.partial}
                  </p>
                </div>
                <div className="flex gap-3">
                  {wordOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleWordOption(opt)}
                      className="w-14 h-14 rounded-xl border-2 border-primary/60 bg-primary/20 text-primary font-black text-xl hover:bg-primary/40 hover:scale-105 active:scale-95 transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Failed overlay */}
            {phase === "failed" && (
              <div className="absolute inset-0 bg-destructive/30 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <X className="w-12 h-12 text-destructive" />
                <p className="font-black text-destructive text-sm">Challenge Failed!</p>
              </div>
            )}

            {/* Done overlay */}
            {phase === "done" && (
              <div className="absolute inset-0 bg-secondary/20 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <p className="text-3xl">✓</p>
                <p className="font-black text-secondary text-sm">{rewardText} Unlocked!</p>
              </div>
            )}

            {/* Feedback toast */}
            {feedbackText && phase === "ad" && (
              <div
                key={challengesDone}
                className="absolute top-2 left-1/2 -translate-x-1/2 bg-secondary/20 border border-secondary/40 text-secondary text-[10px] font-black px-3 py-1 rounded-full animate-fade-in"
              >
                {feedbackText}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="px-4 py-3 space-y-1.5 bg-muted/20">
            <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
              <span>WATCHING AD</span>
              <span>{Math.round(adProgress)}%</span>
            </div>
            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-200"
                style={{ width: `${adProgress}%` }}
              />
            </div>
            <div className="flex gap-2">
              {[0, 1].map((i) => (
                <div key={i} className={cn(
                  "flex-1 h-1 rounded-full transition-all",
                  challengesDone > i ? "bg-secondary" : "bg-muted/60"
                )} />
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground text-center">
              {challengesDone}/2 challenges passed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
