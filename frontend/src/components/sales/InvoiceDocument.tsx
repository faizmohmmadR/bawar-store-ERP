import { saleDisplayQuantity, saleDisplayPrice } from '@/lib/saleDisplay';
import { getStoredCalendarSystem, useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import type { Sale } from '@/types/sale';
import {
  getInvoiceComputed,
  INVOICE_PRINT_CSS,
  type InvoiceLabels,
} from '@/lib/invoiceDocument';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { formatAppDate, formatAppDateTime } from '@/lib/calendarDate';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import { cn } from '@/lib/utils';

type InvoiceDocumentProps = {
  sale: Sale;
  appTitle: string;
  appSubtitle: string;
  direction: 'rtl' | 'ltr';
  printFont: string;
  language: string;
  labels: InvoiceLabels;
  calendar?: CalendarSystem;
};

const toNum = (val: unknown): number => parseFloat(String(val ?? '0')) || 0;

const formatDate = (
  value?: string,
  language: Language | string = 'en',
  calendar: CalendarSystem = getStoredCalendarSystem(),
) =>
  formatAppDate(value, calendar, {
    language: (language as Language) || 'en',
  });

const statusTone = (status?: string) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'draft') return 'draft';
  return '';
};

export function InvoiceDocument({
  sale,
  appTitle,
  appSubtitle,
  direction,
  printFont,
  language,
  labels,
  calendar: requestedCalendar,
}: InvoiceDocumentProps) {
  const { calendar: preferredCalendar } = useCalendarPreference();
  const calendar = requestedCalendar || preferredCalendar;
  const { items, discount, subtotal, finalTotal, paid, remaining, currencyCode } =
    getInvoiceComputed(sale);

  const customer = sale.customer_details;
  const customerName = customer?.name || '—';

  return (
    <>
      <div
        id="invoice-content"
        className="invoice-root bg-white print:bg-white"
        style={{ fontFamily: printFont }}
        dir={direction}
      >
        <div className="invoice-sheet max-w-[210mm] mx-auto px-8 py-10 print:px-0 print:py-0">
          <div className="invoice-accent-bar" />

          <header className="invoice-header">
            <div className="invoice-brand">
              <div className="invoice-logo">
                <img
                  src="/logo/logo.png"
                  alt="Logo"
                  className="invoice-logo-img"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="invoice-logo-fallback hidden">{appTitle.charAt(0)}</div>
              </div>
              <div className="invoice-company">
                <h1>{appTitle}</h1>
                <p>{appSubtitle}</p>
              </div>
            </div>

            <div className="invoice-meta">
              <h2>{labels.invoice}</h2>
              <div className="invoice-meta-grid">
                <div className="invoice-meta-row">
                  <span className="label">{labels.invoiceNumber}</span>
                  <span className="value">{sale.invoice_number || '—'}</span>
                </div>
                <div className="invoice-meta-row">
                  <span className="label">{labels.date}</span>
                  <span className="value">{formatDate(sale.sale_date, language, calendar)}</span>
                </div>
                <div className="invoice-meta-row">
                  <span className="label" />
                  <span className="value">
                    <span className={cn('invoice-status', statusTone(sale.status))}>
                      {sale.status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </header>

          <section className="invoice-parties">
            <div>
              <div className="invoice-panel-title">{labels.billTo}</div>
              <div className="invoice-customer-name">{customerName}</div>
              {customer?.phone && <div className="invoice-customer-line">{customer.phone}</div>}
              {customer?.email && <div className="invoice-customer-line">{customer.email}</div>}
              {customer?.address && (
                <div className="invoice-customer-line">{customer.address}</div>
              )}
            </div>

            {sale.plate_number ? (
              <div>
                <div className="invoice-panel-title">{labels.plateNumber}</div>
                <div className="invoice-plate">{sale.plate_number}</div>
              </div>
            ) : (
              <div>
                <div className="invoice-panel-title">{labels.paymentSummary}</div>
                <div className="invoice-payment-row">
                  <span className="label">{labels.currency}</span>
                  <span className="value">{currencyCode || '—'}</span>
                </div>
              </div>
            )}
          </section>

          <section className="invoice-table-wrap">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th className="center w-10">#</th>
                  <th>{labels.product}</th>
                  <th className="num">{labels.liters}</th>
                  <th className="num">{labels.pricePerLiter}</th>
                  <th className="num">{labels.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const liters = saleDisplayQuantity(item);
                  const price = saleDisplayPrice(item);
                  const lineTotal = liters * price;

                  return (
                    <tr key={item.id || index}>
                      <td className="center">{index + 1}</td>
                      <td>
                        <div className="invoice-item-name">
                          {item.product_details?.name || item.product || '—'}
                        </div>
                        {item.stock_details?.color ? (
                          <div className="invoice-item-sub">{item.stock_details.color}</div>
                        ) : null}
                      </td>
                      <td className="num">{formatOrderNumeric(liters)}</td>
                      <td className="num">
                        {formatOrderNumeric(price)} {currencyCode}
                      </td>
                      <td className="num font-semibold">
                        {formatOrderNumeric(lineTotal)} {currencyCode}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="invoice-bottom">
            <div className="invoice-payment-card">
              <div className="invoice-panel-title">{labels.paymentSummary}</div>
              <div className="invoice-payment-row">
                <span className="label">{labels.grandTotal}</span>
                <span className="value">
                  {formatOrderNumeric(finalTotal)} {currencyCode}
                </span>
              </div>
              <div className="invoice-payment-row paid">
                <span className="label">{labels.paid}</span>
                <span className="value">
                  {formatOrderNumeric(paid)} {currencyCode}
                </span>
              </div>
              <div className="invoice-payment-row balance">
                <span className="label">{labels.balance}</span>
                <span className="value">
                  {formatOrderNumeric(remaining)} {currencyCode}
                </span>
              </div>
            </div>

            <div className="invoice-totals">
              <div className="invoice-total-row">
                <span className="label">{labels.subtotal}</span>
                <span className="value">
                  {formatOrderNumeric(subtotal)} {currencyCode}
                </span>
              </div>
              {discount > 0 && (
                <div className="invoice-total-row discount">
                  <span className="label">
                    {labels.discount} ({sale.discount_percentage}%)
                  </span>
                  <span className="value">
                    -{formatOrderNumeric(discount)} {currencyCode}
                  </span>
                </div>
              )}
              <div className="invoice-grand-total">
                <span>{labels.grandTotal}</span>
                <span className="value">
                  {formatOrderNumeric(finalTotal)} {currencyCode}
                </span>
              </div>
            </div>
          </section>

          {sale.notes && (
            <section className="invoice-notes">
              <div className="invoice-panel-title">{labels.notes}</div>
              <p>{sale.notes}</p>
            </section>
          )}

          <footer className="invoice-footer">
            <h3>{labels.thankYou}</h3>
            <p>{labels.generatedNote}</p>
            <p className="generated">
              {formatAppDateTime(new Date(), calendar, (language as Language) || 'en')}
            </p>
          </footer>
        </div>
      </div>

      <style>{`
        ${INVOICE_PRINT_CSS}

        @media print {
          body * {
            visibility: hidden !important;
          }

          #invoice-content,
          #invoice-content * {
            visibility: visible !important;
          }

          #invoice-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          .no-print {
            display: none !important;
          }

          body {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </>
  );
}

export default InvoiceDocument;
