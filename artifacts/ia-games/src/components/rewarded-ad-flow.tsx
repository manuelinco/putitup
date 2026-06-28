import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { adsChallenge, useWatchAd } from "@workspace/api-client-react";
import { useAdsgram } from "@/hooks/use-adsgram";
import { isTelegramApp } from "@/hooks/useTelegram";
import { HumanCheck } from "@/components/human-check";
import { AdChallenge } from "@/components/ad-challenge";

type Phase = "human" | "loading" | "fallback";

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
  const [phase, setPhase] = useState<Phase>("human");
  const tokenRef = useRef<string | null>(null);
  const startRef = useRef<number>(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase("human");
      tokenRef.current = null;
      runningRef.current = false;
    }
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

  const handleHumanPass = async () => {
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
    } else if (result === "sdk_missing" && !isTelegramApp()) {
      // Browser preview / outside Telegram: use the in-app verified ad so the
      // flow stays testable. This NEVER runs inside the Telegram client.
      startRef.current = Date.now();
      setPhase("fallback");
    } else {
      // Inside Telegram but Adsgram returned no ad (no fill / closed early):
      // be honest — no fake ad and no reward.
      onFail("no_ad");
    }
  };

  if (phase === "human") {
    return (
      <HumanCheck onPass={handleHumanPass} onFail={() => onFail("human_failed")} />
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
