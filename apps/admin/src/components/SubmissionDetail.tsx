import { useEffect, useState } from "react";
import type { AdminSubmissionDetail } from "@kidan/contracts";
import { AdminApiClient, AdminApiError } from "../api/client.js";

interface SubmissionDetailProps {
  client: AdminApiClient;
  detail: AdminSubmissionDetail;
  onDecided: () => Promise<void>;
  onError: (message: string | null) => void;
}

type Decision = "approved" | "rejected" | "changes_requested";

export function SubmissionDetail({ client, detail, onDecided, onError }: SubmissionDetailProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    if (detail.hasPhoto) {
      void client
        .getPhoto(detail.publicCode)
        .then((result) => {
          if (!cancelled) setPhoto(result.dataUrl);
        })
        .catch(() => {
          if (!cancelled) setLocalError("The verification photo could not be loaded.");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [client, detail.publicCode, detail.hasPhoto]);

  async function submitDecision(decision: Decision) {
    if (busy) return;
    setLocalError(null);
    onError(null);
    if (decision !== "approved" && note.trim().length === 0) {
      setLocalError("Please write a short feedback note for the candidate.");
      return;
    }
    const confirmMessage =
      decision === "approved"
        ? `Approve ${detail.publicCode}? This starts the 30-day photo deletion clock.`
        : decision === "rejected"
          ? `Reject ${detail.publicCode}? This suspends the profile.`
          : `Request changes for ${detail.publicCode}? The candidate will be asked to revise.`;
    if (!window.confirm(confirmMessage)) return;

    setBusy(decision);
    try {
      await client.decide(detail.publicCode, {
        decision,
        ...(reasonCode.trim() ? { reasonCode: reasonCode.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      await onDecided();
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "FEEDBACK_REQUIRED") {
        setLocalError("A feedback note is required for this decision.");
      } else if (caught instanceof AdminApiError && caught.code === "NETWORK") {
        setLocalError("Network error — the decision was not saved.");
      } else {
        setLocalError("The decision could not be saved.");
      }
      setBusy(null);
    }
  }

  const { publicProfile, faithAndFamily, partnerPreferences } = detail.publicPayload;

  return (
    <div className="detail-scroll">
      <div className="detail-head">
        <h2>{detail.publicCode}</h2>
        <span className={`status-pill status-${detail.reviewStatus}`}>{labelFor(detail.reviewStatus)}</span>
      </div>

      {localError ? (
        <p className="form-error" role="alert">
          {localError}
        </p>
      ) : null}

      <section className="card private-card">
        <h3>Private identity <span className="tag-private">admin only</span></h3>
        <dl className="kv">
          <div><dt>Full name</dt><dd>{detail.identity.fullName}</dd></div>
          <div><dt>Phone</dt><dd>{detail.identity.phoneNumber}</dd></div>
          <div><dt>Date of birth</dt><dd>{detail.identity.dateOfBirth}</dd></div>
        </dl>
      </section>

      <section className="card">
        <h3>Verification photo</h3>
        {photo ? (
          <img className="verification-photo" src={photo} alt="Verification document/photo" />
        ) : detail.hasPhoto ? (
          <p className="muted">Loading photo…</p>
        ) : (
          <p className="muted">No verification photo on file.</p>
        )}
      </section>

      <section className="card">
        <h3>Public profile</h3>
        <dl className="kv">
          <div><dt>Gender</dt><dd>{publicProfile.gender}</dd></div>
          <div><dt>City</dt><dd>{publicProfile.city}, {publicProfile.countryCode}</dd></div>
          <div><dt>Age</dt><dd>{detail.identity.dateOfBirth}</dd></div>
          <div><dt>Education</dt><dd>{publicProfile.educationLevel}{publicProfile.fieldOfStudy ? ` · ${publicProfile.fieldOfStudy}` : ""}</dd></div>
          <div><dt>Work</dt><dd>{publicProfile.employmentStatus}{publicProfile.occupationCategory ? ` · ${publicProfile.occupationCategory}` : ""}</dd></div>
          <div><dt>Marital status</dt><dd>{publicProfile.maritalStatus}</dd></div>
          <div><dt>Children</dt><dd>{publicProfile.hasChildren ? "Yes" : "No"}</dd></div>
          <div><dt>Height</dt><dd>{publicProfile.heightCm ? `${publicProfile.heightCm} cm` : "—"}</dd></div>
        </dl>
      </section>

      <section className="card">
        <h3>Faith &amp; family</h3>
        <dl className="kv">
          <div><dt>Tradition</dt><dd>Ethiopian Orthodox Tewahedo</dd></div>
          <div><dt>Marriage intention</dt><dd>{faithAndFamily.marriageIntention}</dd></div>
          <div><dt>Wants children</dt><dd>{faithAndFamily.wantsChildren}</dd></div>
          <div><dt>Values</dt><dd>{faithAndFamily.values.join(", ")}</dd></div>
        </dl>
        <p className="bio">“{faithAndFamily.bio}”</p>
      </section>

      <section className="card">
        <h3>Partner preferences</h3>
        <dl className="kv">
          <div><dt>Age range</dt><dd>{partnerPreferences.ageMin}–{partnerPreferences.ageMax}</dd></div>
          <div><dt>Cities</dt><dd>{partnerPreferences.preferredCities.join(", ") || "—"}</dd></div>
          <div><dt>Open to abroad</dt><dd>{partnerPreferences.openToAbroad ? "Yes" : "No"}</dd></div>
          <div><dt>Marital statuses</dt><dd>{partnerPreferences.acceptedMaritalStatuses.join(", ")}</dd></div>
          <div><dt>Accepts children</dt><dd>{partnerPreferences.acceptsPartnerWithChildren ? "Yes" : "No"}</dd></div>
        </dl>
      </section>

      {detail.history.length > 0 ? (
        <section className="card">
          <h3>Review history</h3>
          <ul className="history">
            {detail.history.map((entry, index) => (
              <li key={index}>
                <span className={`status-pill status-${entry.decision}`}>{labelFor(entry.decision)}</span>
                <span className="history-note">{entry.note ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card decision-card">
        <h3>Decision</h3>
        <label htmlFor="reason-code" className="field-label">Reason code (optional)</label>
        <input
          id="reason-code"
          type="text"
          value={reasonCode}
          maxLength={60}
          placeholder="e.g. identity_mismatch"
          onChange={(event) => setReasonCode(event.target.value)}
        />
        <label htmlFor="feedback-note" className="field-label">
          Feedback to candidate {`(required unless approving)`}
        </label>
        <textarea
          id="feedback-note"
          value={note}
          maxLength={2000}
          rows={3}
          placeholder="Private note shown to the candidate when changes are requested or the profile is rejected."
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="decision-actions">
          <button
            type="button"
            className="btn btn-success"
            disabled={busy !== null}
            onClick={() => void submitDecision("approved")}
          >
            {busy === "approved" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            className="btn btn-warning"
            disabled={busy !== null}
            onClick={() => void submitDecision("changes_requested")}
          >
            {busy === "changes_requested" ? "Sending…" : "Request changes"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null}
            onClick={() => void submitDecision("rejected")}
          >
            {busy === "rejected" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </section>
    </div>
  );
}

function labelFor(status: string): string {
  switch (status) {
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "changes_requested": return "Changes requested";
    default: return "Pending";
  }
}
