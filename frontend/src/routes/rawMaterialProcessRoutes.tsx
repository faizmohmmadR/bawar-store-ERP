import { Route } from 'react-router-dom';
import RawMaterialProcessList from '@/pages/raw-material-processes/RawMaterialProcessList';
import CreateRawMaterialProcess from '@/pages/raw-material-processes/CreateRawMaterialProcess';
import RawMaterialProcessDetails from '@/pages/raw-material-processes/RawMaterialProcessDetails';

export const rawMaterialProcessRoutes = (
    <>
        <Route path="raw-material-processes" element={<RawMaterialProcessList />} />
        <Route path="raw-material-processes/add" element={<CreateRawMaterialProcess />} />
        <Route path="raw-material-processes/:id/edit" element={<CreateRawMaterialProcess />} />
        <Route path="raw-material-processes/:id" element={<RawMaterialProcessDetails />} />
    </>
);
