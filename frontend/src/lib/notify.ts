import { collectApiIssues, collectFormIssues, formatValidationIssues, type ErrorPathLabel } from './validationErrors';
import { toast } from 'sonner';

/** Same green Success toast used by useAdd / useUpdate / Add Expense. */
export function notifySuccess(
  description: string,
  options?: {
    title?: string;
    dismissLabel?: string;
  },
) {
  toast.success(options?.title ?? 'Success', {
    description,
    style: {
      background: '#dcfce7',
      border: '1px solid #86efac',
    },
    duration: 4000,
    position: 'top-right',
    action: {
      label: options?.dismissLabel ?? 'Dismiss',
    },
  });
}

/** Same red error toast used by useAdd / useUpdate / Add Expense. */
export function notifyError(
  description: string,
  options?: {
    title?: string;
    dismissLabel?: string;
  },
) {
  toast.error(options?.title ?? 'Error', {
    description,
    classNames: { description: 'whitespace-pre-line' },
    style: {
      background: '#fee2e2',
      border: '1px solid #fca5a5',
    },
    duration: 6000,
    position: 'top-right',
    action: {
      label: options?.dismissLabel ?? 'Dismiss',
    },
  });
}

/** Include field paths so required messages identify the field and item row. */
export function formatFormErrors(
  errors: Record<string, unknown> | null | undefined,
  fallback = 'Please fix the highlighted fields',
  label?: ErrorPathLabel,
): string {
  return formatValidationIssues(collectFormIssues(errors), fallback, label);
}

/** Format nested DRF/Axios errors without losing the item index or field name. */
export function formatApiError(
  error: unknown,
  fallback = 'An unexpected error occurred',
  label?: ErrorPathLabel,
): string {
  const payload = (error as { response?: { data?: unknown } })?.response?.data;
  const issues = collectApiIssues(payload);
  if (issues.length) return formatValidationIssues(issues, fallback, label);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
