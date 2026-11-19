import { Route } from 'react-router-dom';
import LoanList from '@/pages/loans/LoanList';
import AddLoan from '@/pages/loans/AddLoan';
import EditLoan from '@/pages/loans/EditLoan';
import LoanDetails from '@/pages/loans/LoanDetails';
import LoansReportPage from '@/pages/loans/LoansReportPage';

import LoanPaymentManagement from '@/pages/loans/LoanPaymentManagement';
import LoanPaymentForm from '@/pages/loans/LoanPaymentForm';

export const loanRoutes = (
  <>
    <Route path="loan-payments" element={<LoanPaymentManagement />} />
    <Route path="loan-payments/add" element={<LoanPaymentForm />} />
    <Route path="loan-payments/:id/edit" element={<LoanPaymentForm />} />
    <Route path="loans" element={<LoanList />} />
    <Route path="loans/report" element={<LoansReportPage />} />
    <Route path="loans/add" element={<AddLoan />} />
    <Route path="loans/:id" element={<LoanDetails />} />
    <Route path="loans/:id/edit" element={<EditLoan />} />
  </>
);
