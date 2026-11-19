import { CrudDetails } from '@/pages/shared/CrudPages';
import { useWithdrawalConfig } from '@/pages/withdrawals/config';

export default function WithdrawalDetails() {
  return <CrudDetails config={useWithdrawalConfig()} />;
}
