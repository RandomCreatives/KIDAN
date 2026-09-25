import { XIcon } from "../components/Icons";
import { useT } from "../i18n/LanguageProvider";
import { LanguageToggle } from "../i18n/LanguageToggle";

/**
 * Pre-onboarding intro for brand-new candidates (no saved draft).
 *
 * Three deliberately minimal screens shown before step 0 (eligibility):
 *   1. splash   — deep-forest logo moment; auto-advances (~1.5s via the flow),
 *                 tap advances instantly. No chrome, no copy beyond one tagline.
 *   2. welcome  — one greeting, one line, one CTA.
 *   3. founding — Founding Cohort framing for the pilot's first circle.
 *
 * Copy is intentionally sparse ("let the questions speak"). No identity,
 * contact detail, or profile information ever appears here.
 */

export type IntroStage = "splash" | "welcome" | "founding";

interface IntroScreensProps {
  stage: IntroStage;
  /** Advance splash→welcome→founding→done (done lands on eligibility). */
  onNext: () => void;
  /** Leave onboarding entirely (nothing saved at this point). */
  onExit: () => void;
}

const SPLASH_TAGLINE = "Marriage, on purpose.";
const WELCOME_HEADING = "Welcome to Kidan.";
const WELCOME_COPY = "A private, values-first path to intentional marriage.";
const FOUNDING_HEADING = "You’re among our very first.";
const FOUNDING_COPY = "This first circle shapes what Kidan becomes. Thank you for starting with us.";

function IntroChrome({ onExit, label }: { onExit: () => void; label: string }) {
  const t = useT();
  return (
    <header className="intro-topline">
      <span className="section-kicker">{t(label)}</span>
      <LanguageToggle compact />
      <button className="icon-button" type="button" onClick={onExit} aria-label={t("Exit onboarding")}>
        <XIcon size={19} />
      </button>
    </header>
  );
}

export function IntroScreens({ stage, onNext, onExit }: IntroScreensProps) {
  const t = useT();
  if (stage === "splash") {
    return (
      <main className="intro-shell intro-splash">
        <button
          className="intro-splash-tap"
          type="button"
          onClick={onNext}
          aria-label={t("Continue to welcome")}
        >
          <span className="intro-bloom">
            <span className="brand-mark intro-brand-mark" aria-hidden="true">
              <span className="brand-mark-v" />
              <span className="brand-mark-h" />
            </span>
          </span>
          <span className="intro-wordmark intro-fade-up" style={{ animationDelay: "250ms" }}>
            Kidan
          </span>
          <span className="intro-tagline intro-fade-up" style={{ animationDelay: "430ms" }}>
            {t(SPLASH_TAGLINE)}
          </span>
        </button>
      </main>
    );
  }

  if (stage === "welcome") {
    return (
      <main className="intro-shell">
        <IntroChrome onExit={onExit} label="Welcome" />
        <section className="intro-center">
          <h1 className="intro-title intro-fade-up">{t(WELCOME_HEADING)}</h1>
          <p className="intro-copy intro-fade-up" style={{ animationDelay: "90ms" }}>
            {t(WELCOME_COPY)}
          </p>
        </section>
        <div className="intro-footer intro-fade-up" style={{ animationDelay: "180ms" }}>
          <button className="primary-button onboarding-primary" type="button" onClick={onNext}>
            {t("Begin")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="intro-shell">
      <IntroChrome onExit={onExit} label="Founding cohort" />
      <section className="intro-center">
        <span className="intro-badge intro-fade-up">{t("Founding cohort")}</span>
        <h1 className="intro-title intro-fade-up" style={{ animationDelay: "70ms" }}>
          {t(FOUNDING_HEADING)}
        </h1>
        <p className="intro-copy intro-fade-up" style={{ animationDelay: "150ms" }}>
          {t(FOUNDING_COPY)}
        </p>
      </section>
      <div className="intro-footer intro-fade-up" style={{ animationDelay: "230ms" }}>
        <button className="primary-button onboarding-primary" type="button" onClick={onNext}>
          {t("Start your profile")}
        </button>
      </div>
    </main>
  );
}
