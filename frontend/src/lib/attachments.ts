import api from '@/api/client';

export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif';
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 12;

export type AttachmentOwnerType = 'payment' | 'sale';
export type AttachmentKind = 'image' | 'pdf' | 'file';

export type AttachedDocument = {
  id: number;
  title: string;
  original_name?: string;
  file_url?: string | null;
  file_size?: number;
  content_kind?: AttachmentKind;
  created_at?: string;
};

export type AttachedDocumentDraft = {
  key: string;
  id?: number;
  title: string;
  file?: File;
  file_url?: string | null;
  original_name?: string;
  file_size?: number;
  content_kind?: AttachmentKind;
};

export function newDocumentKey() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromFileName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || name;
}

/** Build a unique title from the parent record (not the uploaded file name). */
export function nextRecordDocumentTitle(
  titleBase: string | undefined | null,
  existing: AttachedDocumentDraft[],
  fallback = 'Document',
) {
  const base = (titleBase || '').trim() || fallback;
  const used = new Set(existing.map((d) => (d.title || '').trim().toLowerCase()).filter(Boolean));
  if (!used.has(base.toLowerCase())) return base.slice(0, 255);
  let n = 2;
  while (used.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`.slice(0, 255);
}

export function purchaseDocumentTitleBase(parts: {
  invoiceNumber?: string | null;
  billNumber?: string | null;
  vendorName?: string | null;
  label?: string;
}) {
  const label = (parts.label || 'Purchase').trim();
  const invoice = (parts.invoiceNumber || '').trim();
  const bill = (parts.billNumber || '').trim();
  const vendor = (parts.vendorName || '').trim();
  const ref = invoice || bill;
  if (ref && vendor) return `${label} ${ref} — ${vendor}`;
  if (ref) return `${label} ${ref}`;
  if (vendor) return `${label} — ${vendor}`;
  return label;
}

export function saleDocumentTitleBase(parts: {
  invoiceNumber?: string | null;
  customerName?: string | null;
  label?: string;
}) {
  const label = (parts.label || 'Sale').trim();
  const invoice = (parts.invoiceNumber || '').trim();
  const customer = (parts.customerName || '').trim();
  if (invoice && customer) return `${label} ${invoice} — ${customer}`;
  if (invoice) return `${label} ${invoice}`;
  if (customer) return `${label} — ${customer}`;
  return label;
}

export function paymentDocumentTitleBase(parts: {
  paymentType?: 'sale' | 'purchase';
  invoiceNumber?: string | null;
  partyName?: string | null;
  saleLabel?: string;
}) {
  const label = (
    parts.saleLabel ||
    (parts.paymentType === 'purchase' ? 'Purchase payment' : 'Sale payment')
  ).trim();
  const invoice = (parts.invoiceNumber || '').trim();
  const party = (parts.partyName || '').trim();
  const partyOk = party && party !== '-';

  if (invoice && partyOk) return `${label} ${invoice} — ${party}`;
  if (invoice) return `${label} ${invoice}`;
  if (partyOk) return `${label} — ${party}`;
  return label;
}

export function kindFromName(name?: string): AttachmentKind {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png|webp|gif)$/.test(lower)) return 'image';
  return 'file';
}

export function isAllowedAttachment(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  const allowedType =
    type.startsWith('image/') ||
    type === 'application/pdf' ||
    name.endsWith('.pdf');
  return allowedType && file.size <= ATTACHMENT_MAX_BYTES;
}

export function draftsFromDocuments(docs?: AttachedDocument[] | null): AttachedDocumentDraft[] {
  return (docs || []).map((doc) => ({
    key: `saved-${doc.id}`,
    id: doc.id,
    title: doc.title || '',
    file_url: doc.file_url,
    original_name: doc.original_name,
    file_size: doc.file_size,
    content_kind: doc.content_kind || kindFromName(doc.original_name || doc.file_url || ''),
  }));
}

export async function syncAttachedDocuments(
  ownerType: AttachmentOwnerType,
  ownerId: number | string,
  drafts: AttachedDocumentDraft[],
) {
  const existing = await api.get<AttachedDocument[]>('/attachments/', {
    params: { owner_type: ownerType, object_id: ownerId },
  });
  const current = Array.isArray(existing.data) ? existing.data : [];
  const keepIds = new Set(drafts.map((d) => d.id).filter((id): id is number => Boolean(id)));

  await Promise.all(
    current
      .filter((doc) => !keepIds.has(doc.id))
      .map((doc) => api.delete(`/attachments/${doc.id}/`)),
  );

  for (const draft of drafts) {
    // Skip empty rows that were added but never got a file
    if (!draft.file && !draft.id) continue;
    const title =
      draft.title.trim() ||
      nextRecordDocumentTitle(
        undefined,
        [],
        ownerType === 'sale' ? 'Sale' : 'Payment',
      );
    if (draft.file) {
      const body = new FormData();
      body.append('title', title);
      body.append('file', draft.file);
      if (draft.id) {
        await api.patch(`/attachments/${draft.id}/`, body);
      } else {
        body.append('owner_type', ownerType);
        body.append('object_id', String(ownerId));
        await api.post('/attachments/', body);
      }
      continue;
    }
    if (draft.id && title !== (current.find((d) => d.id === draft.id)?.title || '')) {
      await api.patch(`/attachments/${draft.id}/`, { title });
    }
  }
}
