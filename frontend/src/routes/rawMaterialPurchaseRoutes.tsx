import { Route } from 'react-router-dom';
import RawMaterialPurchaseList from '@/pages/raw-material-purchases/RawMaterialPurchaseList';
import AddRawMaterialPurchase from '@/pages/raw-material-purchases/AddRawMaterialPurchase';
import EditRawMaterialPurchase from '@/pages/raw-material-purchases/EditRawMaterialPurchase';
import RawMaterialPurchaseDetails from '@/pages/raw-material-purchases/RawMaterialPurchaseDetails';

export const rawMaterialPurchaseRoutes = (
  <>
    <Route path="raw-material-purchases" element={<RawMaterialPurchaseList />} />
    <Route path="raw-material-purchases/add" element={<AddRawMaterialPurchase />} />
    <Route path="raw-material-purchases/:id" element={<RawMaterialPurchaseDetails />} />
    <Route path="raw-material-purchases/:id/edit" element={<EditRawMaterialPurchase />} />
  </>
);
