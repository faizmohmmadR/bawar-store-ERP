import { Route } from 'react-router-dom';
import WithdrawalList from '@/pages/withdrawals/WithdrawalList';
import AddWithdrawal from '@/pages/withdrawals/AddWithdrawal';
import EditWithdrawal from '@/pages/withdrawals/EditWithdrawal';
import WithdrawalDetails from '@/pages/withdrawals/WithdrawalDetails';

export const withdrawalRoutes = (
  <>
    <Route path="withdrawals" element={<WithdrawalList />} />
    <Route path="withdrawals/add" element={<AddWithdrawal />} />
    <Route path="withdrawals/:id" element={<WithdrawalDetails />} />
    <Route path="withdrawals/:id/edit" element={<EditWithdrawal />} />
  </>
);
