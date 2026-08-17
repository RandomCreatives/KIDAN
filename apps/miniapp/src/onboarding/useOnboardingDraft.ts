import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import {
  buildSectionPatch,
  mergeFormFromPayload,
  resetFormFromPayload,
  serverStepToClientStep,
  stepToServerStep,
} from "./draftMapping.js";
import { initialOnboardingState, type OnboardingFormState } from "./types.js";
import { ONBOARDING_SCHEMA_VERSION, type PartialPublicOnboardingPayload } from "@kidan/contracts";

export interface SaveResult {
  success: boolean;
  persisted: boolean;
}

export interface DraftLoadResult {
  success: boolean;
  persisted: boolean;
  step: number | null;
}

export interface OnboardingDraftController {
  hydrated: boolean;
  persisted: boolean;
  loadError: boolean;
  saving: boolean;
  saveError: string | null;
  conflict: boolean;
  reloading: boolean;
  reloadError: boolean;
  resumedStep: number | null;
  reloadRevision: number;
  retryLoad: () => Promise<DraftLoadResult>;
  saveProgress: (stepIndex: number, currentDraft: OnboardingFormState) => Promise<SaveResult>;
  reloadLatest: () => Promise<DraftLoadResult>;
}

export function useOnboardingDraft(
  draft: OnboardingFormState,
  setDraft: Dispatch<SetStateAction<OnboardingFormState>>,
): OnboardingDraftController {
  const { csrfToken, isDemo, invalidate, retry } = useAuth();
  const clientRef = useRef(new KidanApiClient());
  const [hydrated, setHydrated] = useState(isDemo);
  const [persisted, setPersisted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [resumedStep, setResumedStep] = useState<number | null>(isDemo ? 0 : null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const expectedVersionRef = useRef(0);
  const conflictRef = useRef(false);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const loadPromiseRef = useRef<Promise<DraftLoadResult> | null>(null);
  const reloadPromiseRef = useRef<Promise<DraftLoadResult> | null>(null);

  const loadDraft = useCallback((): Promise<DraftLoadResult> => {
    if (isDemo) {
      setHydrated(true);
      setLoadError(false);
      setResumedStep(0);
      return Promise.resolve({ success: true, persisted: false, step: 0 });
    }
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setLoadError(false);
    const operation = (async (): Promise<DraftLoadResult> => {
      try {
        const res = await clientRef.current.getDraft();
        const payload = res.payload as Record<string, unknown>;
        if (res.version > 0 && payload && Object.keys(payload).length > 0) {
          setDraft((prev) => mergeFormFromPayload(prev, payload));
        }
        const nextStep = serverStepToClientStep(res.currentStep, isDemo);
        expectedVersionRef.current = res.version;
        setPersisted(res.version > 0);
        setResumedStep(nextStep);
        setReloadRevision((revision) => revision + 1);
        setHydrated(true);
        return { success: true, persisted: res.version > 0, step: nextStep };
      } catch (error: unknown) {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          await invalidate();
          return { success: false, persisted: false, step: null };
        }
        setLoadError(true);
        return { success: false, persisted: false, step: null };
      }
    })();
    const shared = operation.finally(() => {
      loadPromiseRef.current = null;
    });
    loadPromiseRef.current = shared;
    return shared;
  }, [invalidate, isDemo, setDraft]);

  useEffect(() => {
    if (isDemo) {
      setHydrated(true);
      setResumedStep(0);
      return;
    }
    if (!csrfToken) return;
    void loadDraft();
  }, [csrfToken, isDemo, loadDraft]);

  const saveProgress = useCallback(
    async (stepIndex: number, currentDraft: OnboardingFormState): Promise<SaveResult> => {
      if (isDemo) return { success: true, persisted: false };
      if (!csrfToken || !hydrated || conflictRef.current) return { success: false, persisted: false };
      let patch = buildSectionPatch(stepIndex, currentDraft);
      if (!patch && stepToServerStep(stepIndex) === "public_preview") {
        patch = {} as unknown as PartialPublicOnboardingPayload;
      }
      if (!patch) return { success: true, persisted };
      const serverStep = stepToServerStep(stepIndex);

      const run = saveChainRef.current.then(async () => {
        if (conflictRef.current) return { success: false, persisted: false } as const;
        setSaving(true);
        setSaveError(null);
        try {
          const res = await clientRef.current.saveDraft(
            {
              schemaVersion: ONBOARDING_SCHEMA_VERSION,
              expectedVersion: expectedVersionRef.current,
              currentStep: serverStep,
              patch,
            },
            csrfToken,
          );
          expectedVersionRef.current = res.version;
          setConflict(false);
          conflictRef.current = false;
          setReloadError(false);
          setPersisted(true);
          return { success: true, persisted: true } as const;
        } catch (error: unknown) {
          if (error instanceof ApiError) {
            if (error.code === "DRAFT_VERSION_CONFLICT") {
              conflictRef.current = true;
              setConflict(true);
            } else if (error.code === "UNAUTHENTICATED") {
              await invalidate();
            } else if (error.code === "INVALID_CSRF") {
              setSaveError("Your session changed. Reconnecting before you continue.");
              await retry();
            } else if (error.code === "NETWORK") {
              setSaveError("Network error while saving. Retry.");
            } else {
              setSaveError("Could not save your progress. Retry.");
            }
          } else {
            setSaveError("Could not save your progress. Retry.");
          }
          return { success: false, persisted: false } as const;
        } finally {
          setSaving(false);
        }
      });

      const tracked = run.catch(() => ({ success: false, persisted: false }) as const);
      saveChainRef.current = run.catch(() => undefined);
      return tracked;
    },
    [csrfToken, hydrated, invalidate, isDemo, persisted, retry],
  );

  const reloadLatest = useCallback((): Promise<DraftLoadResult> => {
    if (isDemo || !csrfToken) {
      return Promise.resolve({ success: false, persisted, step: null });
    }
    if (reloadPromiseRef.current) return reloadPromiseRef.current;

    setReloading(true);
    const operation = (async (): Promise<DraftLoadResult> => {
      try {
        const res = await clientRef.current.getDraft();
        const payload = res.payload as Record<string, unknown>;
        const nextStep = serverStepToClientStep(res.currentStep, isDemo);
        setDraft(resetFormFromPayload(initialOnboardingState, payload ?? {}));
        expectedVersionRef.current = res.version;
        setConflict(false);
        conflictRef.current = false;
        setReloadError(false);
        setPersisted(res.version > 0);
        setResumedStep(nextStep);
        setReloadRevision((revision) => revision + 1);
        return { success: true, persisted: res.version > 0, step: nextStep };
      } catch (error: unknown) {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          await invalidate();
          return { success: false, persisted, step: null };
        }
        setReloadError(true);
        return { success: false, persisted, step: null };
      }
    })();
    const shared = operation.finally(() => {
      reloadPromiseRef.current = null;
      setReloading(false);
    });
    reloadPromiseRef.current = shared;
    return shared;
  }, [csrfToken, invalidate, isDemo, persisted, setDraft]);

  return {
    hydrated,
    persisted,
    loadError,
    saving,
    saveError,
    conflict,
    reloading,
    reloadError,
    resumedStep,
    reloadRevision,
    retryLoad: loadDraft,
    saveProgress,
    reloadLatest,
  };
}
