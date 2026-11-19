import { Route } from 'react-router-dom';
import DamagedMaterialList from '@/pages/damaged/DamagedMaterialList';
import AddDamagedMaterial from '@/pages/damaged/AddDamagedMaterial';
import EditDamagedMaterial from '@/pages/damaged/EditDamagedMaterial';
import DamagedMaterialDetails from '@/pages/damaged/DamagedMaterialDetails';

export const damagedRoutes = (
  <>
    <Route path="damaged" element={<DamagedMaterialList />} />
    <Route path="damaged/add" element={<AddDamagedMaterial />} />
    <Route path="damaged/:id/edit" element={<EditDamagedMaterial />} />
    <Route path="damaged/:id" element={<DamagedMaterialDetails />} />
  </>
);
