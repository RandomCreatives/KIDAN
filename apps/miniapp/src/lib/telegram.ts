interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export interface TelegramContext {
  isTelegram: boolean;
  initData: string;
  colorScheme: "light" | "dark";
}

export function initializeTelegram(): TelegramContext {
  const webApp = window.Telegram?.WebApp;

  if (!webApp) {
    document.documentElement.dataset.platform = "browser";
    return { isTelegram: false, initData: "", colorScheme: "light" };
  }

  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.("#f6f3ed");
  webApp.setBackgroundColor?.("#f6f3ed");
  webApp.enableClosingConfirmation?.();
  document.documentElement.dataset.platform = "telegram";

  return {
    isTelegram: true,
    initData: webApp.initData,
    colorScheme: webApp.colorScheme,
  };
}

export function haptic(kind: "decision" | "success" | "warning"): void {
  const feedback = window.Telegram?.WebApp.HapticFeedback;
  if (!feedback) return;

  if (kind === "decision") feedback.impactOccurred("light");
  if (kind === "success") feedback.notificationOccurred("success");
  if (kind === "warning") feedback.notificationOccurred("warning");
}
