import { Route } from 'react-router-dom';
import CashRegisterDashboard from '@/pages/cash-register/CashRegisterDashboard';
import CloseCashSession from '@/pages/cash-register/CloseCashSession';
import CashTransactions from '@/pages/cash-register/CashTransactions';
import CashReports from '@/pages/cash-register/CashReports';

export const cashRegisterRoutes = (
  <>
    <Route path="cash-register" element={<CashRegisterDashboard />} />
    <Route path="cash-register/close" element={<CloseCashSession />} />
    <Route path="cash-register/transactions" element={<CashTransactions />} />
    <Route path="cash-register/reports" element={<CashReports />} />
  </>
);
