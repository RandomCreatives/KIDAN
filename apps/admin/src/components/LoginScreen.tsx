import { useState, type FormEvent } from "react";
import { AdminApiError } from "../api/client.js";

interface LoginScreenProps {
  onLogin: (password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          required
        />

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
