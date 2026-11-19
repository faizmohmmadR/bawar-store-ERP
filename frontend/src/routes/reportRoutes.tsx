import { Route } from 'react-router-dom';
import FinancialReportPage from '@/pages/reports/FinancialReportPage';
import ByCurrencyReportPage from '@/pages/reports/ByCurrencyReportPage';
import ExpenseReportPage from '@/pages/reports/ExpenseReportPage';
import ReportHistoryPage from '@/pages/reports/ReportHistoryPage';
import ReportingV2Page from '@/pages/reports/ReportingV2Page';

export const reportRoutes = (
  <>
    <Route path="/reports" element={<FinancialReportPage />} />
    <Route path="/reports/by-currency" element={<ByCurrencyReportPage />} />
    <Route path="/reports/expenses" element={<ExpenseReportPage />} />
    <Route path="/reports/history" element={<ReportHistoryPage />} />
    <Route path="/reports/v2" element={<ReportingV2Page />} />
  </>
);
