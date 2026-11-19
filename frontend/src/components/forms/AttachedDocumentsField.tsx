import { useEffect, useMemo, useRef } from 'react';
import { FileText, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

type Props = {
  value: AttachedDocumentDraft[];
  onChange: (next: AttachedDocumentDraft[]) => void;
  /** Default title taken from the page/record (invoice, bill, etc.), not the file name. */
  titleBase?: string;
  disabled?: boolean;
  className?: string;
  /** When true, omit the built-in title/help (parent already shows a section header). */
  hideHeader?: boolean;
  /** Primary action opens a multi-file picker (best for purchases). */
  multiPick?: boolean;
};

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentPreview({ doc }: { doc: AttachedDocumentDraft }) {
  const objectUrl = useMemo(
    () => (doc.file && doc.content_kind === 'image' ? URL.createObjectURL(doc.file) : ''),
    [doc.file, doc.content_kind],
  );
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const src = objectUrl || (doc.content_kind === 'image' ? doc.file_url || '' : '');
  if (src) {
    return (
      <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-md border object-cover bg-muted" />
    );
  }
  if (doc.content_kind === 'pdf' || doc.file_url) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground">
      <Upload className="h-4 w-4" />
    </div>
  );
}

function DocumentRow({
  doc,
  disabled,
  onTitleChange,
  onFile,
  onRemove,
}: {
  doc: AttachedDocumentDraft;
  disabled?: boolean;
  onTitleChange: (title: string) => void;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = Boolean(doc.file || doc.file_url);
  const fileMeta = hasFile
    ? [doc.original_name || t('common.attachments.file', 'File'), doc.file_size ? formatSize(doc.file_size) : '']
        .filter(Boolean)
        .join(' · ')
    : t('common.attachments.pickFile', 'Choose an image or PDF for this row.');

  return (
    <div className="rounded-lg border bg-background p-3 sm:p-3.5">
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <DocumentPreview doc={doc} />

        <div className="min-w-0 flex-1">
          <Input
            value={doc.title}
            disabled={disabled}
            placeholder={t('common.attachments.titlePlaceholder', 'Document title')}
            onChange={(event) => onTitleChange(event.target.value)}
            className="h-9"
          />
        </div>

        <p
          className="hidden min-w-0 max-w-[10rem] truncate text-xs text-muted-foreground lg:block xl:max-w-[14rem]"
          title={fileMeta}
        >
          {fileMeta}
        </p>

        {doc.file_url && !doc.file ? (
          <a
            href={doc.file_url}
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 text-xs text-primary hover:underline md:inline"
          >
            {t('common.attachments.view', 'View')}
          </a>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-2 sm:px-3"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            <span className="ms-1.5 hidden sm:inline">
              {hasFile
                ? t('common.attachments.replace', 'Replace')
                : t('common.attachments.choose', 'Choose file')}
            </span>
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={onRemove}
            aria-label={t('common.delete', 'Delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="mt-1.5 truncate ps-12 text-xs text-muted-foreground lg:hidden" title={fileMeta}>
        {fileMeta}
        {doc.file_url && !doc.file ? (
          <>
            {' · '}
            <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {t('common.attachments.view', 'View')}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function AttachedDocumentsField({
  value,
  onChange,
  titleBase,
  disabled,
  className,
  hideHeader,
  multiPick = false,
}: Props) {
  const { t } = useLanguage();
  const fallbackTitle = t('common.attachments.defaultTitle', 'Document');
  const prevTitleBase = useRef(titleBase);
  const multiInputRef = useRef<HTMLInputElement>(null);

  // When the selected bill/customer changes, refresh auto titles that still match the old base.
  useEffect(() => {
    const prev = (prevTitleBase.current || '').trim();
    const nextBase = (titleBase || '').trim();
    prevTitleBase.current = titleBase;
    if (!nextBase || prev === nextBase || !value.length) return;

    const rebuilt: AttachedDocumentDraft[] = [];
    for (const doc of value) {
      const title = (doc.title || '').trim();
      const wasAuto =
        !prev ||
        title === prev ||
        title.startsWith(`${prev} (`) ||
        title === fallbackTitle ||
        /^Document( \(\d+\))?$/i.test(title);
      rebuilt.push({
        ...doc,
        title: wasAuto ? nextRecordDocumentTitle(nextBase, rebuilt, fallbackTitle) : doc.title,
      });
    }
    const changed = rebuilt.some((doc, i) => doc.title !== value[i]?.title);
    if (changed) onChange(rebuilt);
  }, [titleBase]); // eslint-disable-line react-hooks/exhaustive-deps -- only when titleBase changes

  const assignFile = (index: number, file: File) => {
    if (disabled) return;
    if (!isAllowedAttachment(file)) {
      toast.error(
        file.size > ATTACHMENT_MAX_BYTES
          ? t('common.attachments.tooLarge', 'Each file must be 10 MB or smaller.')
          : t('common.attachments.invalidType', 'Only images and PDF files are allowed.'),
      );
      return;
    }
    const next = [...value];
    const existing = next[index];
    if (!existing) return;
    next[index] = {
      ...existing,
      file,
      original_name: file.name,
      file_size: file.size,
      content_kind: kindFromName(file.name),
      file_url: existing.id ? existing.file_url : undefined,
    };
    onChange(next);
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || disabled) return;
    const incoming = Array.from(files);
    const next = [...value];
    for (const file of incoming) {
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
    if (multiInputRef.current) multiInputRef.current.value = '';
  };

  const addEmptyRow = () => {
    if (disabled || value.length >= ATTACHMENT_MAX_FILES) {
      if (value.length >= ATTACHMENT_MAX_FILES) {
        toast.error(
          t('common.attachments.maxFiles', `You can attach up to ${ATTACHMENT_MAX_FILES} documents.`),
        );
      }
      return;
    }
    onChange([
      ...value,
      {
        key: newDocumentKey(),
        title: nextRecordDocumentTitle(titleBase, value, fallbackTitle),
      },
    ]);
  };

  const onPrimaryAdd = () => {
    if (multiPick) {
      multiInputRef.current?.click();
    } else {
      addEmptyRow();
    }
  };

  const helpText = multiPick
    ? t(
        'common.attachments.helpMulti',
        'Select one or more images or PDFs. Titles follow this purchase; you can edit them.',
      )
    : t(
        'common.attachments.help',
        'Add a row, then choose an image or PDF. Titles follow the selected bill; you can edit them.',
      );

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!hideHeader ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('common.attachments.title', 'Documents')}</p>
            <p className="text-xs text-muted-foreground">{helpText}</p>
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{helpText}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled || value.length >= ATTACHMENT_MAX_FILES}
          onClick={onPrimaryAdd}
        >
          {multiPick ? <Upload className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {multiPick
            ? t('common.attachments.addFiles', 'Add documents')
            : t('common.attachments.add', 'Add document')}
        </Button>
        <input
          ref={multiInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {value.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onPrimaryAdd}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 sm:py-10 text-center text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-60"
        >
          {multiPick ? <Upload className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          {multiPick
            ? t('common.attachments.emptyMulti', 'Click to choose one or more documents.')
            : t('common.attachments.empty', 'No documents yet. Click to add a row.')}
        </button>
      ) : (
        <div className="space-y-3">
          {value.map((doc, index) => (
            <DocumentRow
              key={doc.key}
              doc={doc}
              disabled={disabled}
              onTitleChange={(title) => {
                const next = [...value];
                next[index] = { ...doc, title };
                onChange(next);
              }}
              onFile={(file) => assignFile(index, file)}
              onRemove={() => onChange(value.filter((item) => item.key !== doc.key))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AttachedDocumentsList({
  documents,
  emptyLabel,
}: {
  documents?: AttachedDocumentDraft[] | { id: number; title: string; file_url?: string | null; original_name?: string; content_kind?: string; file_size?: number }[];
  emptyLabel?: string;
}) {
  const { t } = useLanguage();
  const items = documents || [];
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyLabel || t('common.attachments.none', 'No documents attached.')}
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((doc) => {
        const url = 'file_url' in doc ? doc.file_url : undefined;
        const kind = 'content_kind' in doc ? doc.content_kind : kindFromName(doc.original_name);
        return (
          <a
            key={'id' in doc ? doc.id : doc.title}
            href={url || '#'}
            target={url ? '_blank' : undefined}
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
          >
            {kind === 'image' && url ? (
              <img src={url} alt="" className="h-12 w-12 rounded-md object-cover border bg-muted" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{doc.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {doc.original_name || t('common.attachments.file', 'File')}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
