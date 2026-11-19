import { Route } from 'react-router-dom';
import StorageTankList from '@/pages/storage-tanks/StorageTankList';
import StorageTankDetails from '@/pages/storage-tanks/StorageTankDetails';
import AddStorageTank from '@/pages/storage-tanks/AddStorageTank';
import EditStorageTank from '@/pages/storage-tanks/EditStorageTank';

export const storageTankRoutes = (
    <>
        <Route path="storage-tanks" element={<StorageTankList />} />
        <Route path="storage-tanks/add" element={<AddStorageTank />} />
        <Route path="storage-tanks/:id" element={<StorageTankDetails />} />
        <Route path="storage-tanks/:id/edit" element={<EditStorageTank />} />
    </>
);