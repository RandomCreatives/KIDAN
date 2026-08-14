import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { buildSectionPatch, mergeFormFromPayload, stepToServerStep } from "./draftMapping.js";
import type { OnboardingFormState } from "./types.js";

const SCHEMA_VERSION = "2026-08-12.v1";

export interface OnboardingDraftController {
  hydrated: boolean;
  loadError: boolean;
  saving: boolean;
  saveError: string | null;
  conflict: boolean;
  retryLoad: () => void;
  saveProgress: (stepIndex: number, currentDraft: OnboardingFormState) => void;
  reloadLatest: () => void;
}

export function useOnboardingDraft(
  draft: OnboardingFormState,
  setDraft: Dispatch<SetStateAction<OnboardingFormState>>,
): OnboardingDraftController {
  const { csrfToken, isDemo, invalidate, retry } = useAuth();
  const clientRef = useRef(new KidanApiClient());
  const [hydrated, setHydrated] = useState(isDemo);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const expectedVersionRef = useRef(0);
  const conflictRef = useRef(false);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const loadDraft = useCallback(() => {
    if (isDemo) {
      setHydrated(true);
      setLoadError(false);
      return;
    }
    setLoadError(false);
    clientRef.current
      .getDraft()
      .then((res) => {
        const payload = res.payload as Record<string, unknown>;
        if (res.version > 0 && payload && Object.keys(payload).length > 0) {
          setDraft((prev) => mergeFormFromPayload(prev, payload));
        }
        expectedVersionRef.current = res.version;
        setHydrated(true);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          invalidate();
          return;
        }
        setLoadError(true);
      });
  }, [isDemo, setDraft, invalidate]);

  useEffect(() => {
    if (isDemo) {
      setHydrated(true);
      return;
    }
    if (!csrfToken) return;
    loadDraft();
  }, [csrfToken, isDemo, loadDraft]);

  const saveProgress = useCallback(
    (stepIndex: number, currentDraft: OnboardingFormState) => {
      if (isDemo || !csrfToken || !hydrated || conflictRef.current) return;
      const patch = buildSectionPatch(stepIndex, currentDraft);
      if (!patch) return;
      const serverStep = stepToServerStep(stepIndex);
      const run = saveChainRef.current.then(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          const res = await clientRef.current.saveDraft(
            {
              schemaVersion: SCHEMA_VERSION,
              expectedVersion: expectedVersionRef.current,
              currentStep: serverStep,
              patch,
            },
            csrfToken,
          );
          expectedVersionRef.current = res.version;
          setConflict(false);
          conflictRef.current = false;
        } catch (error: unknown) {
          if (error instanceof ApiError) {
            if (error.code === "DRAFT_VERSION_CONFLICT") {
              conflictRef.current = true;
              setConflict(true);
            } else if (error.code === "UNAUTHENTICATED") {
              invalidate();
            } else if (error.code === "INVALID_CSRF") {
              void retry();
            } else {
              setSaveError("Could not save your progress. Retry.");
            }
          } else {
            setSaveError("Network error while saving. Retry.");
          }
        } finally {
          setSaving(false);
        }
      });
      saveChainRef.current = run.catch(() => undefined);
    },
    [isDemo, csrfToken, hydrated, invalidate, retry],
  );

  const reloadLatest = useCallback(() => {
    if (isDemo || !csrfToken) return;
    clientRef.current
      .getDraft()
      .then((res) => {
        const payload = res.payload as Record<string, unknown>;
        if (payload && Object.keys(payload).length > 0) {
          setDraft((prev) => mergeFormFromPayload(prev, payload));
        }
        expectedVersionRef.current = res.version;
        setConflict(false);
        conflictRef.current = false;
      })
      .catch(() => undefined);
  }, [isDemo, csrfToken, setDraft]);

  return { hydrated, loadError, saving, saveError, conflict, retryLoad: loadDraft, saveProgress, reloadLatest };
}
