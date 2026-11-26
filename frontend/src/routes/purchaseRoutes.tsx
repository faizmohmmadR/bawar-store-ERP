import { Route } from 'react-router-dom';
import PurchaseList from '@/pages/purchases/PurchaseList';
import AddPurchase from '@/pages/purchases/AddPurchase';
import EditPurchase from '@/pages/purchases/EditPurchase';
import PurchaseDetails from '@/pages/purchases/PurchaseDetails';
import PurchasesReportPage from '@/pages/purchases/PurchasesReportPage';

export const purchaseRoutes = (
  <>
    <Route path="purchases" element={<PurchaseList />} />
    <Route path="purchases/report" element={<PurchasesReportPage />} />
    <Route path="purchases/add" element={<AddPurchase />} />
    <Route path="purchases/:id" element={<PurchaseDetails />} />
    <Route path="purchases/:id/edit" element={<EditPurchase />} />
  </>
);