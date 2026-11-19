import { Route } from 'react-router-dom';
import { Vendors } from '@/pages/vendors/VendorList';
import AddVendor from '@/pages/vendors/AddVendor';
import EditVendor from '@/pages/vendors/EditVendor';
import VendorDetails from '@/pages/vendors/VendorDetails';

export const vendorRoutes = (
  <>
    <Route path="vendors" element={<Vendors />} />
    <Route path="vendors/add" element={<AddVendor />} />
    <Route path="vendors/:id" element={<VendorDetails />} />
    <Route path="vendors/:id/edit" element={<EditVendor />} />
  </>
);