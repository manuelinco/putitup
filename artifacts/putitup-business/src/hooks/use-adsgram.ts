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

export const ADSGRAM_BLOCK_ID_WEB = "int-36439";

export function useAdsgram() {
  const showAd = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!window.Adsgram || ADSGRAM_BLOCK_ID_WEB === "YOUR_WEB_BLOCK_ID") {
        resolve(false);
        return;
      }
      try {
        const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_WEB });
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
