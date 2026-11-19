import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormSubmitIntent } from '@/components/forms/FormActions';

type Options = {
  /** When true, apply stay-or-redirect based on last submit intent. */
  isSuccess: boolean;
  /** List path for normal Save / Create. */
  listPath: string;
  /**
   * Optional override after a successful Save (not Save & Create New).
   * Useful when the next step depends on the created record id.
   */
  getSuccessPath?: () => string | null | undefined;
  /** Reset the form when Save & Create New succeeds. */
  onReset: () => void;
  /** Disable redirect handling (e.g. edit mode). Default true. */
  enabled?: boolean;
};

/**
 * Shared Save / Save & Create New behavior for Add forms.
 * Pair with FormActions showSaveAndCreateNew + onIntent.
 */
export function useSaveAndCreateNew({
  isSuccess,
  listPath,
  getSuccessPath,
  onReset,
  enabled = true,
}: Options) {
  const navigate = useNavigate();
  const submitIntent = useRef<FormSubmitIntent>('save');

  useEffect(() => {
    if (!enabled || !isSuccess) return;

    if (submitIntent.current === 'save_and_new') {
      onReset();
      submitIntent.current = 'save';
      return;
    }

    const nextPath = getSuccessPath?.() || listPath;
    navigate(nextPath);
  }, [enabled, isSuccess, listPath, getSuccessPath, navigate, onReset]);

  const onIntent = useCallback((intent: FormSubmitIntent) => {
    submitIntent.current = intent;
  }, []);

  return {
    onIntent,
    showSaveAndCreateNew: enabled,
  };
}
