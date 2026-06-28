import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { adsChallenge, useWatchAd } from "@workspace/api-client-react";
import { useAdsgram } from "@/hooks/use-adsgram";
import { HumanCheck } from "@/components/human-check";
import { AdChallenge } from "@/components/ad-challenge";

type Phase = "human" | "loading" | "fallback";

// Antibot (human-check) temporarily suspended per owner request — show the real
// Adsgram ad immediately. Flip back to false to re-enable the red-dot check.
const ANTIBOT_SUSPENDED = true;

interface RewardedAdFlowProps {
  open: boolean;
  userId: number;
  adType?: "rewarded" | "unlock";
  rewardText?: string;
  onComplete: () => void;
  onFail: (reason: string) => void;
}

/**
 * Full rewarded-ad flow with anti-bot protection:
 *   HumanCheck (red dot) -> POST /ads/challenge (signed token)
 *   -> real Adsgram ad (showAd) -> POST /ads/watch.
 * If the Adsgram SDK is unavailable (browser preview / outside Telegram) we
 * fall back to the in-app verified ad challenge instead of the real network ad.
 * The server measures elapsed time from the signed token, so client timing
 * cannot be forged.
 */
export function RewardedAdFlow({
  open,
  userId,
  adType = "rewarded",
  rewardText = "+20 Energy",
  onComplete,
  onFail,
}: RewardedAdFlowProps) {
  const { showAd } = useAdsgram();
  const watchAd = useWatchAd();
  const [phase, setPhase] = useState<Phase>(ANTIBOT_SUSPENDED ? "loading" : "human");
  const tokenRef = useRef<string | null>(null);
  const startRef = useRef<number>(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    tokenRef.current = null;
    runningRef.current = false;
    if (ANTIBOT_SUSPENDED) {
      // Antibot suspended: go straight to the real Adsgram ad.
      setPhase("loading");
      void runAd();
    } else {
      setPhase("human");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submitWatch = async () => {
    const durationSeconds = (Date.now() - startRef.current) / 1000;
    try {
      const result = await watchAd.mutateAsync({
        data: {
          userId,
          adType,
          completionToken: tokenRef.current ?? undefined,
          durationSeconds,
        },
      });
      if (result.success) {
        onComplete();
      } else {
        onFail(result.reason ?? "error");
      }
    } catch {
      onFail("error");
    }
  };

  const runAd = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("loading");

    try {
      const { challengeToken } = await adsChallenge({ userId });
      tokenRef.current = challengeToken;
    } catch {
      onFail("error");
      return;
    }

    startRef.current = Date.now();
    const result = await showAd();
    if (result === "shown") {
      // A real Adsgram ad was watched to completion.
      await submitWatch();
    } else if (result === "sdk_missing" && import.meta.env.DEV) {
      // LOCAL DEV ONLY (pnpm dev). Compiled out of the production build, so the
      // in-app placeholder can never run — and never grant a reward — inside
      // Telegram or in any deployed browser.
      startRef.current = Date.now();
      setPhase("fallback");
    } else {
      // No real ad played (no fill / closed early / SDK absent in production):
      // be honest — no fake ad and no reward.
      onFail("no_ad");
    }
  };

  if (!ANTIBOT_SUSPENDED && phase === "human") {
    return (
      <HumanCheck onPass={runAd} onFail={() => onFail("human_failed")} />
    );
  }

  if (phase === "fallback") {
    return (
      <AdChallenge
        onComplete={submitWatch}
        onFail={() => onFail("human_failed")}
        rewardText={rewardText}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[2147483647] bg-black/95 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <p className="text-white/70 text-sm">Caricamento annuncio…</p>
    </div>
  );
}
