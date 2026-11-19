import { Route } from 'react-router-dom';
import { RawMaterialSaleList } from '@/pages/raw-material-sales/RawMaterialSaleList';
import AddRawMaterialSale from '@/pages/raw-material-sales/AddRawMaterialSale';
import EditRawMaterialSale from '@/pages/raw-material-sales/EditRawMaterialSale';
import RawMaterialSaleDetails from '@/pages/raw-material-sales/RawMaterialSaleDetails';

export const rawMaterialSaleRoutes = (
  <>
    <Route path="raw-material-sales" element={<RawMaterialSaleList />} />
    <Route path="raw-material-sales/add" element={<AddRawMaterialSale />} />
    <Route path="raw-material-sales/:id" element={<RawMaterialSaleDetails />} />
    <Route path="raw-material-sales/:id/edit" element={<EditRawMaterialSale />} />
  </>
);
