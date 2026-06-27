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

export const ADSGRAM_BLOCK_ID = "YOUR_TELEGRAM_BLOCK_ID";

export function useAdsgram() {
  const showAd = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!window.Adsgram || ADSGRAM_BLOCK_ID === "YOUR_TELEGRAM_BLOCK_ID") {
        resolve(false);
        return;
      }
      try {
        const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        controller
          .show()
          .then(({ done }) => resolve(done === true))
          .catch(() => resolve(false));
      } catch {
        resolve(false);
      }
    });
  };

  return { showAd };
}
