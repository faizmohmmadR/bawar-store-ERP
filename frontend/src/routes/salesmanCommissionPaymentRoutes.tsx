import { Route } from 'react-router-dom';
import SalesmanCommissionPaymentList from '@/pages/salesman-commission-payments/SalesmanCommissionPaymentList';
import AddSalesmanCommissionPayment from '@/pages/salesman-commission-payments/AddSalesmanCommissionPayment';
import EditSalesmanCommissionPayment from '@/pages/salesman-commission-payments/EditSalesmanCommissionPayment';
import SalesmanCommissionPaymentDetails from '@/pages/salesman-commission-payments/SalesmanCommissionPaymentDetails';

export const salesmanCommissionPaymentRoutes = (
  <>
    <Route path="salesman-commission-payments" element={<SalesmanCommissionPaymentList />} />
    <Route path="salesman-commission-payments/add" element={<AddSalesmanCommissionPayment />} />
    <Route
      path="salesman-commission-payments/:id/edit"
      element={<EditSalesmanCommissionPayment />}
    />
    <Route
      path="salesman-commission-payments/:id"
      element={<SalesmanCommissionPaymentDetails />}
    />
  </>
);
