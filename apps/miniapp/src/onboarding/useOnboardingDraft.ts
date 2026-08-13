import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import type { OnboardingStep } from "@kidan/contracts";
import { mergeFormFromPayload, publicPayloadFromForm } from "./draftMapping.js";
import type { OnboardingFormState } from "./types.js";

const SCHEMA_VERSION = "2026-08-12.v1";

const STEP_KEYS: (OnboardingStep | null)[] = [
  "eligibility",
  null,
  "public_profile",
  "faith_and_family",
  "partner_preferences",
  "public_preview",
  null,
];

export interface OnboardingDraftController {
  hydrated: boolean;
  conflict: boolean;
  saveProgress: (stepIndex: number, currentDraft: OnboardingFormState) => void;
  reloadLatest: () => void;
}

export function useOnboardingDraft(
  draft: OnboardingFormState,
  setDraft: Dispatch<SetStateAction<OnboardingFormState>>,
): OnboardingDraftController {
  const { csrfToken, isDemo } = useAuth();
  const clientRef = useRef(new KidanApiClient());
  const [hydrated, setHydrated] = useState(isDemo);
  const [conflict, setConflict] = useState(false);
  const expectedVersionRef = useRef(0);
  const hydratedRef = useRef(isDemo);

  useEffect(() => {
    if (isDemo) {
      hydratedRef.current = true;
      setHydrated(true);
      return;
    }
    let cancelled = false;
    clientRef.current
      .getDraft()
      .then((res) => {
        if (cancelled) return;
        const payload = res.payload as Record<string, unknown> | undefined;
        if (res.version > 0 && payload && Object.keys(payload).length > 0) {
          setDraft((prev) => mergeFormFromPayload(prev, payload));
          expectedVersionRef.current = res.version;
        }
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        hydratedRef.current = true;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, setDraft]);

  const saveProgress = useCallback(
    (stepIndex: number, currentDraft: OnboardingFormState) => {
      if (isDemo || !csrfToken || !hydratedRef.current) return;
      const stepKey = STEP_KEYS[stepIndex];
      if (!stepKey) return;
      void clientRef.current
        .saveDraft(
          {
            schemaVersion: SCHEMA_VERSION,
            expectedVersion: expectedVersionRef.current,
            currentStep: stepKey,
            patch: publicPayloadFromForm(currentDraft),
          },
          csrfToken,
        )
        .then((res) => {
          expectedVersionRef.current = res.version;
          setConflict(false);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.code === "DRAFT_VERSION_CONFLICT") {
            setConflict(true);
          }
        });
    },
    [isDemo, csrfToken],
  );

  const reloadLatest = useCallback(() => {
    if (isDemo || !csrfToken) return;
    void clientRef.current
      .getDraft()
      .then((res) => {
        const payload = res.payload as Record<string, unknown> | undefined;
        if (payload && Object.keys(payload).length > 0) {
          setDraft((prev) => mergeFormFromPayload(prev, payload));
          expectedVersionRef.current = res.version;
          setConflict(false);
        }
      })
      .catch(() => {
        // ignore; keep local state
      });
  }, [isDemo, csrfToken, setDraft]);

  return { hydrated, conflict, saveProgress, reloadLatest };
}
