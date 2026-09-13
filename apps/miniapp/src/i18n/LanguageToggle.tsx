import { useEffect, useRef, useState } from "react";
import { AMHARIC_ENABLED, useI18n, type Lang } from "./LanguageProvider";

/** Notice shown while the Amharic locale is dark-launched (AMHARIC_ENABLED=false). */
const AMHARIC_COMING_SOON = "Amharic is coming soon \u2014 we\u2019re working on it with professional translators.";

/**
 * Compact EN | \u12a0\u121b\u122d\u129b segmented switch. Deliberately bilingual labels: the Amharic
 * label is written in Amharic so it is findable by Amharic readers in either state.
 * While Amharic is dark-launched, tapping it shows a "coming soon" toast instead
 * of switching the locale.
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const options: Array<{ value: Lang; label: string }> = [
    { value: "en", label: "English" },
    { value: "am", label: "\u12a0\u121b\u122d\u129b" },
  ];

  function choose(option: Lang) {
    if (option === "am" && !AMHARIC_ENABLED) {
      setNotice(AMHARIC_COMING_SOON);
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
      return;
    }
    setLang(option);
  }

  return (
    <>
      <div
        className={compact ? "lang-toggle lang-toggle-compact" : "lang-toggle"}
        role="group"
        aria-label={t("Language")}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={lang === option.value ? "lang-option active" : "lang-option"}
            aria-pressed={lang === option.value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {notice && (
        <div className="toast lang-toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
