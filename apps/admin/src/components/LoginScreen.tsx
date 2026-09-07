import { useState, type FormEvent } from "react";
import { AdminApiError } from "../api/client.js";

interface LoginScreenProps {
  onLogin: (password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLogin(password);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        setError("Incorrect operator password.");
      } else if (caught instanceof AdminApiError && caught.code === "NETWORK") {
        setError("Cannot reach the review service. Check your connection and try again.");
      } else if (caught instanceof AdminApiError) {
        // TEMPORARY STAGING DIAGNOSTIC: surface code/status so a failed login
        // is identifiable without dev tools. Revert before production.
        setError(`Sign-in failed [${caught.code}, HTTP ${caught.status}]. Please try again.`);
      } else if (caught instanceof Error) {
        // Client-side contract parse failure, etc.
        setError(`Sign-in failed [client: ${caught.name}: ${caught.message.slice(0, 120)}].`);
      } else {
        setError("Sign-in failed. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-cross">✦</span>
        </div>
        <h1>Kidan Review Console</h1>
        <p className="login-sub">Restricted operator access. Sign in to review candidate submissions.</p>

        <label htmlFor="admin-password" className="field-label">
          Operator password
        </label>
        <div className="password-field">
          <input
            id="admin-password"
            type={revealed ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={busy || password.length === 0}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="login-footnote">
          All actions are recorded. Private details are visible only while a submission is open.
        </p>
      </form>
    </div>
  );
}
