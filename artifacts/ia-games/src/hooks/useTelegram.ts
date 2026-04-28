import { useEffect, useRef, useCallback } from "react";

export type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type HapticNotification = "error" | "success" | "warning";

function getTg() {
  return (window as any).Telegram?.WebApp ?? null;
}

export function useTelegramInit() {
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;
    tg.expand();
    tg.ready();
    tg.enableClosingConfirmation();
    tg.setHeaderColor?.("bg_color");
    tg.disableVerticalSwipes?.();
  }, []);
}

export function useTelegramHaptic() {
  const impact = useCallback((style: HapticStyle = "medium") => {
    getTg()?.HapticFeedback?.impactOccurred?.(style);
  }, []);

  const notification = useCallback((type: HapticNotification) => {
    getTg()?.HapticFeedback?.notificationOccurred?.(type);
  }, []);

  const selection = useCallback(() => {
    getTg()?.HapticFeedback?.selectionChanged?.();
  }, []);

  return { impact, notification, selection };
}

export function useTelegramMainButton(
  text: string,
  onClick: () => void,
  options?: { active?: boolean; visible?: boolean; color?: string }
) {
  const callbackRef = useRef(onClick);
  callbackRef.current = onClick;

  useEffect(() => {
    const tg = getTg();
    if (!tg?.MainButton) return;

    const btn = tg.MainButton;
    const visible = options?.visible ?? true;
    const active = options?.active ?? true;

    btn.setText(text);
    if (options?.color) btn.setParams({ color: options.color });

    const handler = () => callbackRef.current();
    btn.onClick(handler);

    if (visible && active) {
      btn.enable();
      btn.show();
    } else if (visible && !active) {
      btn.disable();
      btn.show();
    } else {
      btn.hide();
    }

    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [text, options?.active, options?.visible, options?.color]);
}

export function useTelegramBackButton(onClick: (() => void) | null) {
  const callbackRef = useRef(onClick);
  callbackRef.current = onClick;

  useEffect(() => {
    const tg = getTg();
    if (!tg?.BackButton) return;

    if (!onClick) {
      tg.BackButton.hide();
      return;
    }

    const handler = () => callbackRef.current?.();
    tg.BackButton.onClick(handler);
    tg.BackButton.show();

    return () => {
      tg.BackButton.offClick(handler);
      tg.BackButton.hide();
    };
  }, [!!onClick]);
}

export function isTelegramApp(): boolean {
  const tg = getTg();
  return !!(tg?.initData && tg.initData.length > 0);
}

export function getTelegramInitData(): string {
  return getTg()?.initData ?? "";
}
