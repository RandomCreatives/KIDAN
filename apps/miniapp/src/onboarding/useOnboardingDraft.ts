import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import {
  buildSectionPatch,
  mergeFormFromPayload,
  publicPayloadFromForm,
  resetFormFromPayload,
  serverStepToClientStep,
  stepToServerStep,
} from "./draftMapping.js";
import { initialOnboardingState, type OnboardingFormState } from "./types.js";
import { ONBOARDING_SCHEMA_VERSION, type PartialPublicOnboardingPayload } from "@kidan/contracts";

export interface SaveResult {
  success: boolean;
  persisted: boolean;
  message?: string;
}

export interface DraftLoadResult {
  success: boolean;
  persisted: boolean;
  step: number | null;
}

export interface OnboardingDraftController {
  hydrated: boolean;
  persisted: boolean;
  submitted: boolean;
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
  const [submitted, setSubmitted] = useState(false);
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
  const hydratedRef = useRef(isDemo);
  const draftRef = useRef(draft);
  const baselineDraftRef = useRef(draft);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const loadPromiseRef = useRef<Promise<DraftLoadResult> | null>(null);
  const reloadPromiseRef = useRef<Promise<DraftLoadResult> | null>(null);
  draftRef.current = draft;

  const hasUnsavedPublicEdits = useCallback((): boolean => (
    JSON.stringify(publicPayloadFromForm(draftRef.current))
    !== JSON.stringify(publicPayloadFromForm(baselineDraftRef.current))
  ), []);

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
        const wasHydrated = hydratedRef.current;
        const hasUnsavedEdits = wasHydrated && hasUnsavedPublicEdits();
        const serverVersionChanged = wasHydrated && res.version !== expectedVersionRef.current;

        if (!hasUnsavedEdits) {
          const nextDraft = wasHydrated
            ? resetFormFromPayload(draftRef.current, payload)
            : (res.version > 0 && Object.keys(payload).length > 0
                ? mergeFormFromPayload(draftRef.current, payload)
                : draftRef.current);
          draftRef.current = nextDraft;
          baselineDraftRef.current = nextDraft;
          setDraft(nextDraft);
        } else if (serverVersionChanged) {
          // Keep local edits intact and require an explicit authoritative reload
          // before writing over a newer server version.
          conflictRef.current = true;
          setConflict(true);
        }

        const nextStep = serverStepToClientStep(res.currentStep, isDemo);
        expectedVersionRef.current = res.version;
        setPersisted(res.version > 0);
        setSubmitted(res.submitted);
        setResumedStep(nextStep);
        setReloadRevision((revision) => revision + 1);
        hydratedRef.current = true;
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
  }, [hasUnsavedPublicEdits, invalidate, isDemo, setDraft]);

  useEffect(() => {
    if (isDemo) {
      hydratedRef.current = true;
      baselineDraftRef.current = draftRef.current;
      setHydrated(true);
      setSubmitted(false);
      setResumedStep(0);
      return;
    }
    if (!csrfToken) return;
    void loadDraft();
  }, [csrfToken, isDemo, loadDraft]);

  const saveProgress = useCallback(
    async (stepIndex: number, currentDraft: OnboardingFormState): Promise<SaveResult> => {
      if (isDemo) return { success: true, persisted: false };
      if (!csrfToken || !hydrated) {
        return { success: false, persisted: false, message: "Your session is not ready. Reconnect and retry." };
      }
      if (conflictRef.current) {
        return { success: false, persisted: false, message: "Reload the latest draft before continuing." };
      }
      const serverStep = stepToServerStep(stepIndex);
      let patch = buildSectionPatch(stepIndex, currentDraft);
      if (!patch && serverStep === "public_preview") {
        patch = {} satisfies PartialPublicOnboardingPayload;
      }
      if (!patch) {
        return { success: false, persisted, message: "Could not prepare this section for saving. Review it and retry." };
      }

      const run = saveChainRef.current.then(async (): Promise<SaveResult> => {
        if (conflictRef.current) {
          return { success: false, persisted: false, message: "Reload the latest draft before continuing." };
        }
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
          baselineDraftRef.current = mergeFormFromPayload(baselineDraftRef.current, patch);
          setConflict(false);
          conflictRef.current = false;
          setReloadError(false);
          setPersisted(true);
          return { success: true, persisted: true };
        } catch (error: unknown) {
          let message = "Could not save your progress. Retry.";
          if (error instanceof ApiError) {
            if (error.code === "DRAFT_VERSION_CONFLICT") {
              conflictRef.current = true;
              setConflict(true);
              message = "Your saved progress changed elsewhere. Reload the latest draft.";
            } else if (error.code === "UNAUTHENTICATED") {
              message = "Your session expired. Reconnect and retry.";
              await invalidate();
            } else if (error.code === "INVALID_CSRF") {
              message = "Your session changed. Reconnecting before you continue.";
              await retry();
            } else if (error.code === "NETWORK") {
              message = "Network error while saving. Retry.";
            }
          }
          setSaveError(message);
          return { success: false, persisted: false, message };
        } finally {
          setSaving(false);
        }
      });

      const tracked = run.catch((): SaveResult => ({
        success: false,
        persisted: false,
        message: "Could not save your progress. Retry.",
      }));
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
        const nextDraft = resetFormFromPayload(initialOnboardingState, payload ?? {});
        draftRef.current = nextDraft;
        baselineDraftRef.current = nextDraft;
        setDraft(nextDraft);
        expectedVersionRef.current = res.version;
        setConflict(false);
        conflictRef.current = false;
        setReloadError(false);
        setPersisted(res.version > 0);
        setSubmitted(res.submitted);
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
    submitted,
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
