import { Route } from 'react-router-dom';
import EquipmentList from '@/pages/equipment/EquipmentList';
import AddEquipment from '@/pages/equipment/AddEquipment';
import EditEquipment from '@/pages/equipment/EditEquipment';
import EquipmentDetails from '@/pages/equipment/EquipmentDetails';
import EquipmentReportPage from '@/pages/equipment/EquipmentReportPage';

export const equipmentRoutes = (
  <>
    <Route path="equipment" element={<EquipmentList />} />
    <Route path="equipment/report" element={<EquipmentReportPage />} />
    <Route path="equipment/add" element={<AddEquipment />} />
    <Route path="equipment/:id" element={<EquipmentDetails />} />
    <Route path="equipment/:id/edit" element={<EditEquipment />} />
  </>
);
