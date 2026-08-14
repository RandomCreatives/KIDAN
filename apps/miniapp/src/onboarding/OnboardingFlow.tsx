import { useEffect, useMemo, useRef, useState } from "react";
import {
  consentDraftSchema,
  eligibilitySchema,
  faithAndFamilyDraftSchema,
  partnerPreferencesDraftSchema,
  privateIdentityDraftSchema,
  publicProfileDraftSchema,
  type MarriageIntention,
  type MaritalStatus,
  type ValueTag,
} from "@kidan/contracts";
import { useAuth } from "../auth/useAuth";
import { Brand } from "../components/Brand";
import {
  ArrowLeftIcon,
  BellIcon,
  CameraIcon,
  CheckIcon,
  ChurchIcon,
  EyeIcon,
  LockIcon,
  ShieldCheckIcon,
  SparkIcon,
  XIcon,
} from "../components/Icons";
import { haptic } from "../lib/telegram";
import { ChoiceChips, Field, SegmentedChoice, StepHeading, ToggleCard, VisibilityPill } from "./FormControls";
import { PublicPreview } from "./PublicPreview";
import { cityOptions, marriageOptions, maritalOptions, valueOptions } from "./options";
import { initialOnboardingState, syntheticOnboardingState, type OnboardingFormState } from "./types";
import { useOnboardingDraft } from "./useOnboardingDraft";

interface OnboardingFlowProps {
  mode: "demo" | "real";
  onExit: (saved?: boolean) => void;
  onComplete: () => void;
}

const LABELS = [
  "Eligibility",
  "Private identity",
  "Public profile",
  "Faith & family",
  "Preferences",
  "Preview",
  "Consent",
] as const;

function isAdult(dateOfBirth: string): boolean {
  if (!dateOfBirth) return false;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() - 18);
  return birth <= threshold;
}

export function OnboardingFlow({ mode, onExit, onComplete }: OnboardingFlowProps) {
  const isDemo = mode === "demo";
  const [draft, setDraft] = useState<OnboardingFormState>(initialOnboardingState);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedEver, setSavedEver] = useState(false);
  const appliedResumeRef = useRef(false);

  const {
    hydrated,
    loadError,
    saving,
    saveError,
    conflict,
    reloadError,
    resumedStep,
    retryLoad,
    saveProgress,
    reloadLatest,
  } = useOnboardingDraft(draft, setDraft);

  const activeIndices = useMemo(
    () => (isDemo ? [0, 1, 2, 3, 4, 5, 6] : [0, 2, 3, 4, 5]),
    [isDemo],
  );
  const currentIndex = activeIndices[step] ?? 0;

  useEffect(() => {
    if (hydrated && resumedStep != null && !appliedResumeRef.current) {
      appliedResumeRef.current = true;
      setStep(resumedStep);
    }
  }, [hydrated, resumedStep]);

  const progress = useMemo(() => ((step + 1) / activeIndices.length) * 100, [step, activeIndices.length]);

  const patch = <K extends keyof OnboardingFormState>(section: K, value: Partial<OnboardingFormState[K]>) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...value } }));
  };

  const validationMessage = (): string | null => {
    if (currentIndex === 0 && !eligibilitySchema.safeParse(draft.eligibility).success) {
      return "Confirm all three eligibility requirements to continue.";
    }
    if (currentIndex === 1) {
      if (!isAdult(draft.privateIdentity.dateOfBirth)) return "Enter a valid date of birth for an adult aged 18 or older.";
      const result = privateIdentityDraftSchema.safeParse({
        ...draft.privateIdentity,
        verificationPhotoStatus: "not_available_in_prototype",
      });
      if (!result.success) return "Complete your full name, date of birth, and phone number.";
    }
    if (currentIndex === 2 && !publicProfileDraftSchema.safeParse(draft.publicProfile).success) {
      return "Complete the required public-profile fields before continuing.";
    }
    if (currentIndex === 3) {
      const result = faithAndFamilyDraftSchema.safeParse({
        faithTradition: "ethiopian_orthodox_tewahedo",
        ...draft.faithAndFamily,
      });
      if (!result.success) return "Choose at least three values and write a short introduction of 20–280 characters.";
    }
    if (currentIndex === 4) {
      if (/(@|https?:|t\.me|\+?\d[\d\s-]{7,})/i.test(draft.partnerPreferences.additionalPreferences)) {
        return "Do not include phone numbers, usernames, or links in partner preferences.";
      }
      if (!partnerPreferencesDraftSchema.safeParse(draft.partnerPreferences).success) {
        return "Review the age range and select at least one status, value, and marriage intention.";
      }
    }
    if (currentIndex === 6 && !consentDraftSchema.safeParse(draft.consent).success) {
      return "Accept every required consent. Bot notifications remain optional.";
    }
    return null;
  };

  const continueFlow = async () => {
    const message = validationMessage();
    if (message) {
      setError(message);
      haptic("warning");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    haptic("decision");
    const saved = await saveProgress(currentIndex, draft);
    if (!saved) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSavedEver(true);
    if (step === activeIndices.length - 1) {
      setSubmitted(true);
      haptic("success");
      return;
    }
    setStep((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!hydrated && !isDemo) {
    return (
      <main className="onboarding-shell">
        <header className="onboarding-topbar">
          <Brand />
          <button className="icon-button" type="button" onClick={() => onExit(savedEver)} aria-label="Exit onboarding"><XIcon size={19} /></button>
        </header>
        <section className="page-intro">
          <span className="section-kicker">Kidan</span>
          <h1>{loadError ? "Could not load your draft" : "Loading your draft…"}</h1>
          <p>{loadError ? "Check your connection and try again." : "Restoring your saved progress."}</p>
          {loadError && (
            <button className="primary-button" type="button" onClick={retryLoad}>
              Retry
            </button>
          )}
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="onboarding-shell success-shell">
        <div className="success-mark"><CheckIcon size={34} /></div>
        <span className="section-kicker">{isDemo ? "Prototype complete" : "Draft saved"}</span>
        <h1>{isDemo ? "Your profile would now enter private review." : "Your public draft is saved."}</h1>
        <p>
          {isDemo
            ? "No information was uploaded or saved. This prototype used in-memory draft data only."
            : "In this preview, only your public profile sections are saved. Submission, identity verification, and administrator review are not enabled."}
        </p>
        <div className="review-status-card">
          <span><ShieldCheckIcon /></span>
          <div>
            <strong>{isDemo ? "Profile review" : "Preview only"}</strong>
            <small>{isDemo ? "Pending administrator verification" : "Submission not enabled in this preview"}</small>
          </div>
          <i>{isDemo ? "Demo" : "Preview"}</i>
        </div>
        <div className="success-promise">
          <LockIcon size={18} />
          <p>Your verification photo would remain admin-only and be scheduled for deletion 30 days after approval.</p>
        </div>
        <button className="primary-button onboarding-primary" type="button" onClick={onComplete}>
          {isDemo ? "Enter the demo app" : "Continue"}
        </button>
      </main>
    );
  }

  const showSample = isDemo;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Brand />
        <button className="icon-button" type="button" onClick={() => onExit(savedEver)} aria-label="Exit onboarding"><XIcon size={19} /></button>
      </header>

      <div className="progress-meta"><span>{LABELS[currentIndex]}</span><strong>{step + 1} of {activeIndices.length}</strong></div>
      <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {saveError && <div className="form-error" role="alert">{saveError}</div>}
      {saving && <div className="form-notice" role="status" aria-live="polite">Saving…</div>}
      {(conflict || reloadError) && !isDemo && (
        <div className="form-error draft-conflict" role="alert" aria-live="assertive">
          <span>{reloadError ? "Could not reload the latest draft. Try again." : "Your saved progress changed elsewhere. Reload the latest draft?"}</span>
          <button type="button" className="sample-link" onClick={() => reloadLatest()} disabled={saving}>Reload latest</button>
        </div>
      )}
      {!isDemo && (
        <div className="preview-rule"><LockIcon size={17} /><p>This preview saves only your public profile sections. Identity, verification, and review are disabled.</p></div>
      )}

      <div className="onboarding-content">
        {currentIndex === 0 && (
          <>
            <StepHeading eyebrow="Welcome to Kidan" title="A private path to intentional marriage." description="Before creating a profile, confirm that this community and its privacy model are right for you." />
            <section className="privacy-hero">
              <div className="privacy-hero-mark"><LockIcon size={24} /></div>
              <div><strong>Private by default</strong><p>No names, phone numbers, Telegram accounts, or photos appear in discovery.</p></div>
            </section>
            <div className="promise-grid">
              <div><ShieldCheckIcon /><strong>Verified</strong><span>Every profile is privately reviewed.</span></div>
              <div><EyeIcon /><strong>Anonymous</strong><span>Discovery is values-only.</span></div>
              <div><SparkIcon /><strong>Intentional</strong><span>No contact before every approval.</span></div>
            </div>
            <section className="form-section">
              <h2>Eligibility</h2>
              <ToggleCard checked={draft.eligibility.adultConfirmed} onChange={(value) => patch("eligibility", { adultConfirmed: value })} title="I am 18 or older" description="Date of birth is verified privately and never displayed." />
              <ToggleCard checked={draft.eligibility.eotcConfirmed} onChange={(value) => patch("eligibility", { eotcConfirmed: value })} title="I am Ethiopian Orthodox Tewahedo" description="The first release is dedicated to the EOTC community." icon={<ChurchIcon size={20} />} />
              <ToggleCard checked={draft.eligibility.marriageIntentConfirmed} onChange={(value) => patch("eligibility", { marriageIntentConfirmed: value })} title="I am seeking an intentional marriage" description="Kidan is not an open social or casual-chat platform." />
            </section>
            {showSample && (
              <button className="sample-link" type="button" onClick={() => setDraft(syntheticOnboardingState)}>Use synthetic sample data for this prototype</button>
            )}
          </>
        )}

        {currentIndex === 1 && (
          <>
            <StepHeading eyebrow="Private identity" title="Verify the person, protect the identity." description="Only authorized verification administrators can access this section." />
            <div className="prototype-warning"><SparkIcon size={17} /><p>This is a local prototype. Use the synthetic sample—not real personal information.</p>{showSample && <button type="button" onClick={() => setDraft(syntheticOnboardingState)}>Fill sample</button>}</div>
            <div className="form-stack">
              <Field label="Full legal name" visibility="admin" hint="Never used as your discovery name.">
                <input value={draft.privateIdentity.fullName} onChange={(event) => patch("privateIdentity", { fullName: event.target.value })} placeholder="Admin verification only" autoComplete="off" />
              </Field>
              <Field label="Date of birth" visibility="admin" hint="Others see only your calculated age.">
                <input type="date" value={draft.privateIdentity.dateOfBirth} onChange={(event) => patch("privateIdentity", { dateOfBirth: event.target.value })} />
              </Field>
              <Field label="Phone number" visibility="admin" hint="Verification only; never sent in a bot notification.">
                <input type="tel" value={draft.privateIdentity.phoneNumber} onChange={(event) => patch("privateIdentity", { phoneNumber: event.target.value })} placeholder="+251 …" autoComplete="off" />
              </Field>
            </div>
            <section className="photo-verification-card">
              <div className="photo-icon"><CameraIcon /></div>
              <div><span className="field-label-row"><strong>Candidate verification photo</strong><VisibilityPill visibility="admin" /></span><p>Used only to verify identity. It is never shown in discovery and is deleted 30 days after approval.</p></div>
              <button type="button" disabled>Secure upload added with storage</button>
            </section>
          </>
        )}

        {currentIndex === 2 && (
          <>
            <StepHeading eyebrow="Public profile" title="Share context, not your identity." description="These approved fields form your anonymous discovery card." />
            <div className="visibility-banner"><EyeIcon size={17} /> Everything on this page may appear in discovery.</div>
            <div className="form-stack">
              <Field label="Gender" visibility="public"><SegmentedChoice value={draft.publicProfile.gender} options={[{ value: "female", label: "Woman" }, { value: "male", label: "Man" }]} onChange={(gender) => patch("publicProfile", { gender })} /></Field>
              <Field label="Country and city" visibility="public">
                <div className="two-fields"><select value={draft.publicProfile.countryCode} onChange={(event) => patch("publicProfile", { countryCode: event.target.value })}><option value="ET">Ethiopia</option><option value="OT">Other</option></select><input value={draft.publicProfile.city} onChange={(event) => patch("publicProfile", { city: event.target.value })} placeholder="City" /></div>
              </Field>
              <Field label="Education" visibility="public">
                <select value={draft.publicProfile.educationLevel} onChange={(event) => patch("publicProfile", { educationLevel: event.target.value as OnboardingFormState["publicProfile"]["educationLevel"] })}>
                  <option value="secondary">Secondary school</option><option value="certificate">Certificate</option><option value="diploma">Diploma</option><option value="bachelors">Bachelor’s degree</option><option value="masters">Master’s degree</option><option value="doctorate">Doctorate</option><option value="other">Other</option>
                </select>
              </Field>
              <Field label="Field of study" visibility="public" hint="Optional broad category only."><input value={draft.publicProfile.fieldOfStudy} onChange={(event) => patch("publicProfile", { fieldOfStudy: event.target.value })} placeholder="e.g. Public health" /></Field>
              <Field label="Employment" visibility="public">
                <div className="two-fields"><select value={draft.publicProfile.employmentStatus} onChange={(event) => patch("publicProfile", { employmentStatus: event.target.value as OnboardingFormState["publicProfile"]["employmentStatus"] })}><option value="employed">Employed</option><option value="self_employed">Self-employed</option><option value="student">Student</option><option value="seeking_work">Seeking work</option><option value="not_working">Not working</option><option value="other">Other</option></select><input value={draft.publicProfile.occupationCategory} onChange={(event) => patch("publicProfile", { occupationCategory: event.target.value })} placeholder="Broad field" /></div>
              </Field>
              <Field label="Marital status" visibility="public"><select value={draft.publicProfile.maritalStatus} onChange={(event) => patch("publicProfile", { maritalStatus: event.target.value as MaritalStatus })}>{maritalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="Children" visibility="public"><SegmentedChoice value={draft.publicProfile.hasChildren ? "yes" : "no"} options={[{ value: "no", label: "No children" }, { value: "yes", label: "Has children" }]} onChange={(value) => patch("publicProfile", { hasChildren: value === "yes" })} /></Field>
              <Field label="Height" visibility="public" hint="Optional. Health and complexion are intentionally not collected."><div className="unit-input"><input type="number" min="120" max="230" value={draft.publicProfile.heightCm ?? ""} onChange={(event) => patch("publicProfile", { heightCm: event.target.value ? Number(event.target.value) : null })} placeholder="165" /><span>cm</span></div></Field>
            </div>
          </>
        )}

        {currentIndex === 3 && (
          <>
            <StepHeading eyebrow="Faith & family" title="Describe the life you hope to build." description="Kidan supports faith-centered introductions without scoring anyone’s spiritual worth." />
            <section className="fixed-faith-card"><ChurchIcon /><div><small>Community</small><strong>Ethiopian Orthodox Tewahedo</strong></div><CheckIcon size={18} /></section>
            <div className="form-stack">
              <Field label="Church marriage intention" visibility="public"><select value={draft.faithAndFamily.marriageIntention} onChange={(event) => patch("faithAndFamily", { marriageIntention: event.target.value as MarriageIntention })}>{marriageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="Future children" visibility="public"><select value={draft.faithAndFamily.wantsChildren} onChange={(event) => patch("faithAndFamily", { wantsChildren: event.target.value as OnboardingFormState["faithAndFamily"]["wantsChildren"] })}><option value="yes">Would like children</option><option value="no">Does not plan to have children</option><option value="open_to_discussion">Open to discussion</option></select></Field>
              <Field label="Values that describe you" visibility="public" hint={`${draft.faithAndFamily.values.length}/6 selected · choose at least 3`}><ChoiceChips values={draft.faithAndFamily.values} options={valueOptions} max={6} onChange={(values: ValueTag[]) => patch("faithAndFamily", { values })} /></Field>
              <Field label="A short introduction" visibility="public" hint={`${draft.faithAndFamily.bio.length}/280 · no names, contacts, employer, address, or parish`}><textarea rows={5} maxLength={280} value={draft.faithAndFamily.bio} onChange={(event) => patch("faithAndFamily", { bio: event.target.value })} placeholder="Share your character, family intentions, and what a faithful partnership means to you." /></Field>
            </div>
          </>
        )}

        {currentIndex === 4 && (
          <>
            <StepHeading eyebrow="Partner preferences" title="Choose compatibility, not a ranking." description="Hard preferences are reciprocal. Optional preferences do not make one person more valuable than another." />
            <div className="form-stack">
              <Field label="Preferred age range"><div className="range-inputs"><input type="number" min="18" max="90" value={draft.partnerPreferences.ageMin} onChange={(event) => patch("partnerPreferences", { ageMin: Number(event.target.value) })} /><span>to</span><input type="number" min="18" max="90" value={draft.partnerPreferences.ageMax} onChange={(event) => patch("partnerPreferences", { ageMax: Number(event.target.value) })} /></div></Field>
              <Field label="Preferred cities" hint="Select any that apply."><ChoiceChips values={draft.partnerPreferences.preferredCities} options={cityOptions.map((city) => ({ value: city, label: city }))} onChange={(preferredCities: string[]) => patch("partnerPreferences", { preferredCities })} /></Field>
              <ToggleCard checked={draft.partnerPreferences.openToAbroad} onChange={(openToAbroad) => patch("partnerPreferences", { openToAbroad })} title="Open to someone living abroad" description="This can be changed whenever your profile is active." />
              <Field label="Accepted marital status"><ChoiceChips values={draft.partnerPreferences.acceptedMaritalStatuses} options={maritalOptions} onChange={(acceptedMaritalStatuses: MaritalStatus[]) => patch("partnerPreferences", { acceptedMaritalStatuses })} /></Field>
              <ToggleCard checked={draft.partnerPreferences.acceptsPartnerWithChildren} onChange={(acceptsPartnerWithChildren) => patch("partnerPreferences", { acceptsPartnerWithChildren })} title="Open to a partner with children" description="Shown only as a matching preference." />
              <Field label="Values you hope to share" hint="Choose up to 6."><ChoiceChips values={draft.partnerPreferences.desiredValues} options={valueOptions} max={6} onChange={(desiredValues: ValueTag[]) => patch("partnerPreferences", { desiredValues })} /></Field>
              <Field label="Accepted marriage intentions"><ChoiceChips values={draft.partnerPreferences.acceptedMarriageIntentions} options={marriageOptions} onChange={(acceptedMarriageIntentions: MarriageIntention[]) => patch("partnerPreferences", { acceptedMarriageIntentions })} /></Field>
              <Field label="Additional preferences" hint={`${draft.partnerPreferences.additionalPreferences.length}/400 · reviewed before publication`}><textarea rows={4} maxLength={400} value={draft.partnerPreferences.additionalPreferences} onChange={(event) => patch("partnerPreferences", { additionalPreferences: event.target.value })} placeholder="Optional. Do not add phone numbers, usernames, links, or identifying details." /></Field>
            </div>
          </>
        )}

        {currentIndex === 5 && (
          <>
            <StepHeading eyebrow="Public preview" title="Know exactly what others can see." description="Review the discovery projection. Submission for administrator approval is not enabled in this preview." />
            <PublicPreview draft={draft} mode={mode} />
            <div className="preview-rule"><LockIcon size={17} /><p>The private verification photo cannot later become a discovery photo without a separate upload and a new consent.</p></div>
          </>
        )}

        {currentIndex === 6 && (
          <>
            <StepHeading eyebrow="Consent & submission" title="Your information, your choices." description="Required purposes are separated. Notifications remain optional and can be changed later." />
            <section className="consent-group">
              <ToggleCard checked={draft.consent.informationAccurate} onChange={(informationAccurate) => patch("consent", { informationAccurate })} title="The information is accurate" description="I understand that misleading profiles may be rejected." />
              <ToggleCard checked={draft.consent.identityProcessing} onChange={(identityProcessing) => patch("consent", { identityProcessing })} title="Private identity processing" description="Admin-only name, birth date, phone, and Telegram mapping." icon={<LockIcon size={19} />} />
              <ToggleCard checked={draft.consent.faithDataProcessing} onChange={(faithDataProcessing) => patch("consent", { faithDataProcessing })} title="Faith-data processing" description="My EOTC and marriage-intention information may be used for this service." icon={<ChurchIcon size={19} />} />
              <ToggleCard checked={draft.consent.discoveryPublication} onChange={(discoveryPublication) => patch("consent", { discoveryPublication })} title="Anonymous discovery publication" description="Only the exact public preview may be shown to approved users." icon={<EyeIcon size={19} />} />
              <ToggleCard checked={draft.consent.verificationPhotoRetention} onChange={(verificationPhotoRetention) => patch("consent", { verificationPhotoRetention })} title="Verification-photo processing" description="Admin-only; scheduled for deletion 30 days after approval." icon={<CameraIcon size={19} />} />
              <ToggleCard checked={draft.consent.communityRules} onChange={(communityRules) => patch("consent", { communityRules })} title="Community and safety rules" description="I agree to respectful conduct, blocking, reporting, and administrator review." icon={<ShieldCheckIcon size={19} />} />
            </section>
            <section className="optional-consent">
              <ToggleCard checked={draft.consent.botNotifications} onChange={(botNotifications) => patch("consent", { botNotifications })} title="Generic bot notifications" description="Optional. Bot messages contain no names, profiles, or contact information." icon={<BellIcon size={19} />} />
            </section>
            <div className="prototype-submit-note"><SparkIcon size={17} /><p>Prototype mode: submitting will not upload, persist, or transmit any information.</p></div>
          </>
        )}
      </div>

      <footer className="onboarding-footer">
        {step > 0 ? (
          <button className="back-button" type="button" onClick={goBack} disabled={saving || conflict || reloadError}><ArrowLeftIcon size={18} /> Back</button>
        ) : (
          <button className="back-button" type="button" onClick={() => onExit(savedEver)} disabled={saving || conflict || reloadError}>{isDemo ? "Explore demo" : "Exit"}</button>
        )}
        <button className="continue-button" type="button" onClick={() => void continueFlow()} disabled={saving || conflict || reloadError}>
          {currentIndex === 6 || (!isDemo && step === activeIndices.length - 1) ? (isDemo ? "Submit for review" : "Save draft") : "Continue"}<span>→</span>
        </button>
      </footer>
    </main>
  );
}
