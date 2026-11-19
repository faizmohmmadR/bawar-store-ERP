import { useRef } from 'react';
import { FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  type AttachedDocumentDraft,
  isAllowedAttachment,
  kindFromName,
  newDocumentKey,
  nextRecordDocumentTitle,
} from '@/lib/attachments';
import {
  orderFormHeaderControlClass,
  orderFormHeaderField,
  orderFormHeaderLabel,
} from '@/components/forms/orderFormStyles';
import { cn } from '@/lib/utils';

type Props = {
  value: AttachedDocumentDraft[];
  onChange: (next: AttachedDocumentDraft[]) => void;
  titleBase?: string;
  disabled?: boolean;
};

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact multi-document control — matches other purchase header FormItems. */
export function HeaderDocumentsField({ value, onChange, titleBase, disabled }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackTitle = t('common.attachments.defaultTitle', 'Document');

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || disabled) return;
    const next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= ATTACHMENT_MAX_FILES) {
        toast.error(
          t('common.attachments.maxFiles', `You can attach up to ${ATTACHMENT_MAX_FILES} documents.`),
        );
        break;
      }
      if (!isAllowedAttachment(file)) {
        toast.error(
          file.size > ATTACHMENT_MAX_BYTES
            ? t('common.attachments.tooLarge', 'Each file must be 10 MB or smaller.')
            : t('common.attachments.invalidType', 'Only images and PDF files are allowed.'),
        );
        continue;
      }
      next.push({
        key: newDocumentKey(),
        title: nextRecordDocumentTitle(titleBase, next, fallbackTitle),
        file,
        original_name: file.name,
        file_size: file.size,
        content_kind: kindFromName(file.name),
      });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const summary =
    value.length === 0
      ? t('common.attachments.choose', 'Choose files')
      : value.length === 1
        ? value[0].title || t('common.attachments.file', 'File')
        : t('common.attachments.countSelected', '{{count}} documents').replace(
            '{{count}}',
            String(value.length),
          );

  return (
    <div className={cn(orderFormHeaderField, 'gap-2')}>
      <span
        className={cn(
          orderFormHeaderLabel,
          'inline-flex h-5 min-h-5 items-center leading-none',
        )}
      >
        {t('common.attachments.title', 'Documents')}
      </span>

      <div
        className={cn(
          orderFormHeaderControlClass(),
          'relative flex items-center overflow-hidden bg-background p-0',
          disabled && 'opacity-60',
        )}
      >
        <button
          type="button"
          disabled={disabled || value.length >= ATTACHMENT_MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-normal',
            'disabled:cursor-not-allowed',
            value.length === 0 && 'text-muted-foreground',
          )}
        >
          <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{summary}</span>
        </button>

        {value.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="flex h-full w-9 shrink-0 items-center justify-center border-s border-input text-muted-foreground hover:bg-muted/50 disabled:cursor-not-allowed"
                aria-label={t('common.attachments.view', 'View')}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2 sm:w-96">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-sm font-medium">
                  {t('common.attachments.title', 'Documents')} ({value.length})
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled || value.length >= ATTACHMENT_MAX_FILES}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('common.attachments.addFiles', 'Add')}
                </Button>
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {value.map((doc) => (
                  <li
                    key={doc.key}
                    className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{doc.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {doc.original_name || t('common.attachments.file', 'File')}
                        {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      disabled={disabled}
                      onClick={() => onChange(value.filter((item) => item.key !== doc.key))}
                      aria-label={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full text-xs text-destructive hover:text-destructive"
                disabled={disabled}
                onClick={() => onChange([])}
              >
                <X className="h-3.5 w-3.5" />
                {t('common.attachments.clearAll', 'Clear all')}
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <p className="text-xs min-h-4" aria-hidden />

      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => addFiles(event.target.files)}
      />
    </div>
  );
}
