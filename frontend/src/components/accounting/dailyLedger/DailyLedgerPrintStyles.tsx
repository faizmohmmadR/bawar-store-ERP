export function DailyLedgerPrintStyles() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        #daily-ledger-print, #daily-ledger-print * { visibility: visible; }
        #daily-ledger-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
        .no-print { display: none !important; }
      }
    `}</style>
  );
}
