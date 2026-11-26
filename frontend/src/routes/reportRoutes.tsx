import { Navigate, Route } from 'react-router-dom';
import ReportsHubPage from '@/pages/reports/ReportsHubPage';
import ByCurrencyReportPage from '@/pages/reports/ByCurrencyReportPage';
import ReportHistoryPage from '@/pages/reports/ReportHistoryPage';
import ReportingV2Page from '@/pages/reports/ReportingV2Page';

export const reportRoutes = (
  <>
    <Route path="/reports" element={<ReportsHubPage />} />
    <Route path="/reports/by-currency" element={<ByCurrencyReportPage />} />
    {/* Legacy duplicate — expenses live under the Expenses section */}
    <Route path="/reports/expenses" element={<Navigate to="/expenses/report" replace />} />
    {/* Legacy ops page — hub replaces it */}
    <Route path="/reports/operations" element={<Navigate to="/reports" replace />} />
    <Route path="/reports/history" element={<ReportHistoryPage />} />
    <Route path="/reports/v2" element={<ReportingV2Page />} />
  </>
);
