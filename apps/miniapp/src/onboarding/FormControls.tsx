import type { ReactNode } from "react";
import { CheckIcon, EyeIcon, LockIcon } from "../components/Icons";

export function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="onboarding-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function VisibilityPill({ visibility }: { visibility: "admin" | "public" }) {
  return (
    <span className={`visibility-pill ${visibility}`}>
      {visibility === "admin" ? <LockIcon size={12} /> : <EyeIcon size={12} />}
      {visibility === "admin" ? "Admin only" : "Shown in discovery"}
    </span>
  );
}

export function Field({ label, hint, visibility, children }: {
  label: string;
  hint?: string;
  visibility?: "admin" | "public";
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="field-label-row">
        <strong>{label}</strong>
        {visibility && <VisibilityPill visibility={visibility} />}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ToggleCard({ checked, onChange, title, description, icon }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <button className={`toggle-card ${checked ? "selected" : ""}`} type="button" onClick={() => onChange(!checked)} aria-pressed={checked}>
      {icon && <span className="toggle-icon">{icon}</span>}
      <span className="toggle-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="check-control">{checked && <CheckIcon size={15} />}</span>
    </button>
  );
}

export function SegmentedChoice<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-choice">
      {options.map((option) => (
        <button key={option.value} className={value === option.value ? "selected" : ""} type="button" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ChoiceChips<T extends string>({ values, options, onChange, max }: {
  values: T[];
  options: Array<{ value: T; label: string }>;
  onChange: (values: T[]) => void;
  max?: number;
}) {
  const toggle = (value: T) => {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    if (!max || values.length < max) onChange([...values, value]);
  };

  return (
    <div className="choice-chips">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button key={option.value} className={selected ? "selected" : ""} type="button" onClick={() => toggle(option.value)} aria-pressed={selected}>
            {selected && <CheckIcon size={13} />}{option.label}
          </button>
        );
      })}
    </div>
  );
}
