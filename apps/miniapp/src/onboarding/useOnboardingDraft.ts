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
import type { PartialPublicOnboardingPayload } from "@kidan/contracts";

const SCHEMA_VERSION = "2026-08-12.v1";

export interface SaveResult {
  success: boolean;
  persisted: boolean;
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
  retryLoad: () => void;
  saveProgress: (stepIndex: number, currentDraft: OnboardingFormState) => Promise<SaveResult>;
  reloadLatest: () => void;
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
  const reloadingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const loadDraft = useCallback(() => {
    if (isDemo) {
      setHydrated(true);
      setLoadError(false);
      setResumedStep(0);
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
        setPersisted(res.version > 0);
        setResumedStep(serverStepToClientStep(res.currentStep, isDemo));
        setReloadRevision((r) => r + 1);
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
      setResumedStep(0);
      return;
    }
    if (!csrfToken) return;
    loadDraft();
  }, [csrfToken, isDemo, loadDraft]);

  const saveProgress = useCallback(
    async (stepIndex: number, currentDraft: OnboardingFormState): Promise<SaveResult> => {
      if (isDemo) return { success: true, persisted: false };
      if (!csrfToken || !hydrated || conflictRef.current) return { success: false, persisted: false };
      let patch = buildSectionPatch(stepIndex, currentDraft);
      if (!patch && stepToServerStep(stepIndex) === "public_preview") {
        patch = {} as unknown as PartialPublicOnboardingPayload;
      }
      if (!patch) return { success: true, persisted: false };
      const serverStep = stepToServerStep(stepIndex);

      const run = saveChainRef.current.then(async () => {
        if (conflictRef.current) return { success: false, persisted: false } as const;
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
          setReloadError(false);
          setPersisted(true);
          return { success: true, persisted: true } as const;
        } catch (error: unknown) {
          if (error instanceof ApiError) {
            if (error.code === "DRAFT_VERSION_CONFLICT") {
              conflictRef.current = true;
              setConflict(true);
            } else if (error.code === "UNAUTHENTICATED") {
              invalidate();
            } else if (error.code === "INVALID_CSRF") {
              setSaveError("Your session expired. Reconnecting before you continue.");
              void retry();
            } else {
              setSaveError("Could not save your progress. Retry.");
            }
          } else {
            setSaveError("Network error while saving. Retry.");
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
    [isDemo, csrfToken, hydrated, invalidate, retry],
  );

  const reloadLatest = useCallback(() => {
    if (isDemo || !csrfToken || reloadingRef.current) return;
    reloadingRef.current = true;
    setReloading(true);
    clientRef.current
      .getDraft()
      .then((res) => {
        const payload = res.payload as Record<string, unknown>;
        setDraft(resetFormFromPayload(initialOnboardingState, payload ?? {}));
        expectedVersionRef.current = res.version;
        setConflict(false);
        conflictRef.current = false;
        setReloadError(false);
        setPersisted(res.version > 0);
        setResumedStep(serverStepToClientStep(res.currentStep, isDemo));
        setReloadRevision((r) => r + 1);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          invalidate();
          return;
        }
        setReloadError(true);
      })
      .finally(() => {
        reloadingRef.current = false;
        setReloading(false);
      });
  }, [isDemo, csrfToken, setDraft, invalidate]);

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
