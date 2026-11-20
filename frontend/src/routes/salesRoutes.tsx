import { Route } from 'react-router-dom';
import { SaleList } from '@/pages/sales/SaleList';
import AddSale from '@/pages/sales/AddSale';
import AddReturn from '@/pages/sales/AddReturn';
import EditSale from '@/pages/sales/EditSale';
import SaleDetails from '@/pages/sales/SaleDetails';
import PrintBill from '@/pages/sales/PrintBill';
import SalesReportPage from '@/pages/sales/SalesReportPage';

export const salesRoutes = (
  <>
    <Route path="sales" element={<SaleList />} />
    <Route path="sales/report" element={<SalesReportPage />} />
    <Route path="sales/add" element={<AddSale />} />
    <Route path="sales/:id" element={<SaleDetails />} />
    <Route path="sales/:id/edit" element={<EditSale />} />
    <Route path="sales/:id/return" element={<AddReturn />} />
    <Route path="sales/:id/print" element={<PrintBill />} />
  </>
);