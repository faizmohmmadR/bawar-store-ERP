import { Route } from 'react-router-dom';
import RawMaterialList from '@/pages/raw-materials/RawMaterialList';
import AddRawMaterial from '@/pages/raw-materials/AddRawMaterial';
import EditRawMaterial from '@/pages/raw-materials/EditRawMaterial';
import RawMaterialDetails from '@/pages/raw-materials/RawMaterialDetails';
import RawMaterialReportPage from '@/pages/raw-materials/RawMaterialReportPage';

export const rawMaterialRoutes = (
  <>
    <Route path="raw-materials" element={<RawMaterialList />} />
    <Route path="raw-materials/report" element={<RawMaterialReportPage />} />
    <Route path="raw-materials/add" element={<AddRawMaterial />} />
    <Route path="raw-materials/:id" element={<RawMaterialDetails />} />
    <Route path="raw-materials/:id/edit" element={<EditRawMaterial />} />
  </>
);
