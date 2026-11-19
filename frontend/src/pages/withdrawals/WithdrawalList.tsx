import { CrudList } from '@/pages/shared/CrudPages';
import { useWithdrawalConfig } from '@/pages/withdrawals/config';

export default function WithdrawalList() {
  return <CrudList config={useWithdrawalConfig()} />;
}
