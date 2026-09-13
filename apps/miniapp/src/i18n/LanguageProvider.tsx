import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { am } from "./am";

export type Lang = "en" | "am";

const STORAGE_KEY = "kidan.lang";

/**
 * Master switch for the Amharic locale.
 *
 * The compiled catalog (src/i18n/am.ts, 451 strings) is complete, but it stays
 * dark until the translations pass professional review. While this is false:
 *   - every user gets English (saved choice, ?lang= and Telegram am-detection ignored),
 *   - setLang("am") is a no-op,
 *   - the toggle shows a "coming soon" notice instead of switching.
 * Flip to true (after reviewer sign-off) to enable detection + switching again.
 */
export const AMHARIC_ENABLED = false;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a natural English key; `vars` fill {placeholders}. Falls back to the key itself (English). */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "am";
}

/** Telegram Mini Apps expose the user's chosen language under initDataUnsafe.user.language_code. */
function telegramLanguageCode(): string | null {
  try {
    const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return typeof code === "string" && code.length > 0 ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** URL override (?lang=am) — used by the bot deep links and for QA previews. */
function urlLang(): Lang | null {
  try {
    const value = new URL(window.location.href).searchParams.get("lang");
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

/** Detection order: saved manual choice → ?lang= override → Telegram language_code → English. */
export function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  if (!AMHARIC_ENABLED) {
    // Dark launch: always English. Clear a previously saved Amharic choice so
    // returning testers from earlier builds do not get stuck on a dark locale.
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "am") window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — nothing to clear
    }
    return "en";
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // storage unavailable (private mode etc.) — fall through
  }
  const url = urlLang();
  if (url) return url;
  const tg = telegramLanguageCode();
  if (tg && tg.startsWith("am")) return "am";
  return "en";
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  // Keep <html lang> and a data attribute in sync for font/CSS hooks.
  useEffect(() => {
    document.documentElement.lang = lang === "am" ? "am" : "en";
    document.documentElement.dataset.locale = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    if (next === "am" && !AMHARIC_ENABLED) return; // dark launch — switching is UI-notified instead
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // persistence is best-effort; the switch still applies for this session
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const text = lang === "am" ? (am[key] ?? key) : key;
      return interpolate(text, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Fallback for components rendered outside <LanguageProvider> (unit tests,
 * isolated previews): detects the language once and translates without
 * persistence. Inside the app the provider value is always used.
 */
let fallback: I18nValue | null = null;
function getFallback(): I18nValue {
  if (!fallback) {
    const lang = detectInitialLang();
    fallback = {
      lang,
      setLang: () => {},
      t: (key, vars) => interpolate(lang === "am" ? (am[key] ?? key) : key, vars),
    };
  }
  return fallback;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  return ctx ?? getFallback();
}

/** Convenience alias used across screens. */
export function useT() {
  const { t } = useI18n();
  return t;
}
