import { Route } from 'react-router-dom';
import { ReturnList } from '@/pages/returns/ReturnList';
import AddReturn from '@/pages/returns/AddReturn';
import EditReturn from '@/pages/returns/EditReturn';
import ReturnDetails from '@/pages/returns/ReturnDetails';

export const returnRoutes = (
  <>
    <Route path="returns" element={<ReturnList />} />
    <Route path="returns/add" element={<AddReturn />} />
    <Route path="returns/:id" element={<ReturnDetails />} />
    <Route path="returns/:id/edit" element={<EditReturn />} />
  </>
);