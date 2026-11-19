import { ReloadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export type FormSubmitIntent = 'save' | 'save_and_new';

interface FormActionsProps {
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  className?: string;
  /** create = show Save & Create New; edit = hide it. */
  mode?: 'create' | 'edit';
  /** Override mode. Defaults to true when mode is create. */
  showSaveAndCreateNew?: boolean;
  saveAndCreateNewLabel?: string;
  /** Called just before submit so the parent can track intent. */
  onIntent?: (intent: FormSubmitIntent) => void;
}

export function FormActions({
  onCancel,
  loading = false,
  submitLabel,
  loadingLabel,
  cancelLabel,
  className,
  mode = 'edit',
  showSaveAndCreateNew,
  saveAndCreateNewLabel,
  onIntent,
}: FormActionsProps) {
  const { t } = useLanguage();
  const allowSaveAndNew = showSaveAndCreateNew ?? mode === 'create';

  return (
    <div
      className={cn(
        'mt-2 flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={loading}
        className="w-full sm:w-auto"
      >
        {cancelLabel ?? t('common.cancel')}
      </Button>

      {allowSaveAndNew && (
        <Button
          type="submit"
          variant="secondary"
          disabled={loading}
          className="w-full sm:w-auto"
          onClick={() => onIntent?.('save_and_new')}
        >
          {loading ? (
            <>
              <ReloadIcon className="animate-spin" />
              {loadingLabel ?? t('common.saving')}
            </>
          ) : (
            saveAndCreateNewLabel ?? t('common.saveAndCreateNew')
          )}
        </Button>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full sm:w-auto"
        onClick={() => onIntent?.('save')}
      >
        {loading ? (
          <>
            <ReloadIcon className="animate-spin" />
            {loadingLabel ?? t('common.saving')}
          </>
        ) : (
          submitLabel ?? t('common.save')
        )}
      </Button>
    </div>
  );
}
