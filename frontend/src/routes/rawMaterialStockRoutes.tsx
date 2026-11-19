import { Route } from 'react-router-dom';
import RawMaterialStockList from '@/pages/raw-material-stocks/RawMaterialStockList';
import AddRawMaterialStock from '@/pages/raw-material-stocks/AddRawMaterialStock';
import EditRawMaterialStock from '@/pages/raw-material-stocks/EditRawMaterialStock';

export const rawMaterialStockRoutes = (
  <>
    <Route path="raw-material-stocks" element={<RawMaterialStockList />} />
    <Route path="raw-material-stocks/add" element={<AddRawMaterialStock />} />
    <Route path="raw-material-stocks/:id/edit" element={<EditRawMaterialStock />} />
  </>
);
