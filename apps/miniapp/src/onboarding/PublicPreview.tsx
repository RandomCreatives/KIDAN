import type { OnboardingFormState } from "./types";
import { labelFor } from "./options";
import { EyeIcon, LockIcon, ShieldCheckIcon } from "../components/Icons";
import { useT } from "../i18n/LanguageProvider";

function ageFromDate(date: string): number | null {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function PublicPreview({ draft, mode }: { draft: OnboardingFormState; mode: "demo" | "real" }) {
  const t = useT();
  const isDemo = mode === "demo";
  const age = ageFromDate(draft.privateIdentity.dateOfBirth);
  const ageLabel = age != null ? age : "—";
  const headerText = isDemo
    ? "This is exactly what discovery could show (synthetic sample)"
    : "Public draft preview — unsubmitted and unpublished";
  const badge = isDemo ? "Sample" : "Draft · not submitted";
  const code = isDemo ? "KD-6V8T3R" : "Unassigned";

  return (
    <div className="preview-stage">
      <div className="preview-visibility"><EyeIcon size={15} /> {t(headerText)}</div>
      <article className="onboarding-preview-card">
        <div className="preview-art">
          <div className="preview-rings" />
          <div className="preview-medallion"><span>{ageLabel}</span><small>{t("values first")}</small></div>
          <span className="preview-verified">{t(badge)}</span>
          <div className="preview-title"><h2>{ageLabel} <i>•</i> {draft.publicProfile.city || t("Your city")}</h2><p>{code === "Unassigned" ? t(code) : code}</p></div>
        </div>
        <div className="preview-body">
          <span>{draft.publicProfile.occupationCategory || t("Occupation")} · {labelFor(draft.publicProfile.educationLevel)}</span>
          <h3>{t("Ethiopian Orthodox Tewahedo")} · {t(labelFor(draft.faithAndFamily.marriageIntention))}</h3>
          <div className="value-list">
            {draft.faithAndFamily.values.slice(0, 4).map((value) => <span key={value}>{t(labelFor(value))}</span>)}
          </div>
          <p>{draft.faithAndFamily.bio || t("Your short introduction will appear here.")}</p>
        </div>
      </article>

      <section className="preview-field-list">
        <div className="preview-field-header"><EyeIcon size={15} /><strong>{t("Visible in the full discovery profile")}</strong></div>
        <dl>
          <div><dt>{t("Gender")}</dt><dd>{draft.publicProfile.gender === "female" ? t("Woman") : t("Man")}</dd></div>
          <div><dt>{t("Education")}</dt><dd>{t(labelFor(draft.publicProfile.educationLevel))}{draft.publicProfile.fieldOfStudy ? ` · ${draft.publicProfile.fieldOfStudy}` : ""}</dd></div>
          <div><dt>{t("Employment")}</dt><dd>{t(labelFor(draft.publicProfile.employmentStatus))} · {draft.publicProfile.occupationCategory || t("Not completed")}</dd></div>
          <div><dt>{t("Family status")}</dt><dd>{t(labelFor(draft.publicProfile.maritalStatus))} · {draft.publicProfile.hasChildren ? t("Has children") : t("No children")}</dd></div>
          <div><dt>{t("Height")}</dt><dd>{draft.publicProfile.heightCm ? `${draft.publicProfile.heightCm} cm` : t("Not shared")}</dd></div>
          <div><dt>{t("Future children")}</dt><dd>{t(labelFor(draft.faithAndFamily.wantsChildren))}</dd></div>
        </dl>
      </section>

      <div className="matching-only-card">
        <ShieldCheckIcon size={18} />
        <div><strong>{t("Preferences are matching-only")}</strong><p>{t("Age range, accepted locations, marital/children preferences, and desired values are used to create a compatible deck—not shown as a public checklist.")}</p></div>
      </div>

      <div className="never-shown-card">
        <div className="never-shown-icon"><LockIcon size={19} /></div>
        <div><strong>{t("Never shown in discovery")}</strong><p>{t("Full name, phone, date of birth, Telegram identity, and verification photo.")}</p></div>
      </div>
    </div>
  );
}
