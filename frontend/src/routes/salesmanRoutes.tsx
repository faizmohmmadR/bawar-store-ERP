import { Route } from 'react-router-dom';
import { Salesmen } from '@/pages/salesmen/SalesmanList';
import AddSalesman from '@/pages/salesmen/AddSalesman';
import EditSalesman from '@/pages/salesmen/EditSalesman';
import SalesmanDetails from '@/pages/salesmen/SalesmanDetails';

export const salesmanRoutes = (
  <>
    <Route path="salesmen" element={<Salesmen />} />
    <Route path="salesmen/add" element={<AddSalesman />} />
    <Route path="salesmen/:id" element={<SalesmanDetails />} />
    <Route path="salesmen/:id/edit" element={<EditSalesman />} />
  </>
);
