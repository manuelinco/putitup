import { useState, useEffect, useRef, useCallback } from "react";
import { Shield } from "lucide-react";

const TAP_WINDOW = 5;

function randomPos() {
  const margin = 20;
  return {
    x: margin + Math.random() * (100 - 2 * margin),
    y: margin + Math.random() * (100 - 2 * margin),
  };
}

interface HumanCheckProps {
  onPass: () => void;
  onFail: () => void;
}

/**
 * Quick anti-bot gate shown BEFORE every real ad: the user must tap a single
 * red dot within a short window. A miss (or timeout) fails the check so bots
 * that auto-trigger ads are filtered out before the ad even loads.
 */
export function HumanCheck({ onPass, onFail }: HumanCheckProps) {
  const [pos] = useState(randomPos);
  const [secs, setSecs] = useState(TAP_WINDOW);
  const doneRef = useRef(false);

  useEffect(() => {
    if (secs <= 0) {
      if (!doneRef.current) {
        doneRef.current = true;
        onFail();
      }
      return;
    }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, onFail]);

  const tap = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onPass();
  }, [onPass]);

  return (
    <div className="fixed inset-0 z-[2147483647] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-start">
      <div className="w-full pt-10 px-6 text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-primary font-bold">
          <Shield className="w-5 h-5" />
          <span>Verifica anti-bot</span>
        </div>
        <p className="text-white/80 text-sm">
          Tocca il punto rosso per continuare
        </p>
        <p className="text-white/40 text-xs">{secs}s</p>
      </div>

      <div className="relative flex-1 w-full">
        <button
          type="button"
          onClick={tap}
          aria-label="Tocca il punto rosso"
          className="absolute w-[72px] h-[72px] rounded-full bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)] ring-4 ring-red-400/40 animate-pulse active:scale-90 transition-transform"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
    </div>
  );
}
