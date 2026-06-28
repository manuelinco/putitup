declare global {
  interface Window {
    Adsgram?: {
      init(params: { blockId: string; debug?: boolean }): {
        show(): Promise<{ done: boolean; description?: string; error?: boolean }>;
        destroy(): void;
      };
    };
  }
}

export const ADSGRAM_BLOCK_ID = "int-36439";

/**
 * Result of attempting to show a real Adsgram ad:
 *   "shown"       — a real ad was watched to completion (reward eligible)
 *   "no_ad"       — Adsgram served nothing (no fill) or the user closed early
 *   "sdk_missing" — the Adsgram SDK is not loaded (e.g. browser preview)
 */
export type AdShowResult = "shown" | "no_ad" | "sdk_missing";

export function useAdsgram() {
  const showAd = (): Promise<AdShowResult> => {
    return new Promise((resolve) => {
      if (!window.Adsgram) {
        resolve("sdk_missing");
        return;
      }
      try {
        const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        controller
          .show()
          .then(({ done }) => resolve(done === true ? "shown" : "no_ad"))
          .catch(() => resolve("no_ad"));
      } catch {
        resolve("no_ad");
      }
    });
  };

  return { showAd };
}
