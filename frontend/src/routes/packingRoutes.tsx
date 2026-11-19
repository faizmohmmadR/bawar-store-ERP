import { Route } from 'react-router-dom';
import PackingRunList from '@/pages/packing/PackingRunList';
import CreatePackingRun from '@/pages/packing/CreatePackingRun';
import PackingRunDetails from '@/pages/packing/PackingRunDetails';

export const packingRoutes = (
    <>
        <Route path="packing" element={<PackingRunList />} />
        <Route path="packing/add" element={<CreatePackingRun />} />
        <Route path="packing/:id" element={<PackingRunDetails />} />
        <Route path="packing/:id/edit" element={<CreatePackingRun />} />
    </>
);
