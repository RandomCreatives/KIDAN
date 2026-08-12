import type { OnboardingFormState } from "./types";
import { labelFor } from "./options";
import { EyeIcon, LockIcon, ShieldCheckIcon } from "../components/Icons";

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

export function PublicPreview({ draft }: { draft: OnboardingFormState }) {
  const age = ageFromDate(draft.privateIdentity.dateOfBirth) ?? "—";
  return (
    <div className="preview-stage">
      <div className="preview-visibility"><EyeIcon size={15} /> This is exactly what discovery will show</div>
      <article className="onboarding-preview-card">
        <div className="preview-art">
          <div className="preview-rings" />
          <div className="preview-medallion"><span>{age}</span><small>values first</small></div>
          <span className="preview-verified"><ShieldCheckIcon size={14} /> Admin verified</span>
          <div className="preview-title"><h2>{age} <i>•</i> {draft.publicProfile.city || "Your city"}</h2><p>KD-6V8T3R</p></div>
        </div>
        <div className="preview-body">
          <span>{draft.publicProfile.occupationCategory || "Occupation"} · {labelFor(draft.publicProfile.educationLevel)}</span>
          <h3>Ethiopian Orthodox Tewahedo · {labelFor(draft.faithAndFamily.marriageIntention)}</h3>
          <div className="value-list">
            {draft.faithAndFamily.values.slice(0, 4).map((value) => <span key={value}>{labelFor(value)}</span>)}
          </div>
          <p>{draft.faithAndFamily.bio || "Your short introduction will appear here."}</p>
        </div>
      </article>

      <section className="preview-field-list">
        <div className="preview-field-header"><EyeIcon size={15} /><strong>Visible in the full discovery profile</strong></div>
        <dl>
          <div><dt>Gender</dt><dd>{draft.publicProfile.gender === "female" ? "Woman" : "Man"}</dd></div>
          <div><dt>Education</dt><dd>{labelFor(draft.publicProfile.educationLevel)}{draft.publicProfile.fieldOfStudy ? ` · ${draft.publicProfile.fieldOfStudy}` : ""}</dd></div>
          <div><dt>Employment</dt><dd>{labelFor(draft.publicProfile.employmentStatus)} · {draft.publicProfile.occupationCategory || "Not completed"}</dd></div>
          <div><dt>Family status</dt><dd>{labelFor(draft.publicProfile.maritalStatus)} · {draft.publicProfile.hasChildren ? "Has children" : "No children"}</dd></div>
          <div><dt>Height</dt><dd>{draft.publicProfile.heightCm ? `${draft.publicProfile.heightCm} cm` : "Not shared"}</dd></div>
          <div><dt>Future children</dt><dd>{labelFor(draft.faithAndFamily.wantsChildren)}</dd></div>
        </dl>
      </section>

      <div className="matching-only-card">
        <ShieldCheckIcon size={18} />
        <div><strong>Preferences are matching-only</strong><p>Age range, accepted locations, marital/children preferences, and desired values are used to create a compatible deck—not shown as a public checklist.</p></div>
      </div>

      <div className="never-shown-card">
        <div className="never-shown-icon"><LockIcon size={19} /></div>
        <div><strong>Never shown in discovery</strong><p>Full name, phone, date of birth, Telegram identity, and verification photo.</p></div>
      </div>
    </div>
  );
}
