import { CrudList } from '@/pages/shared/CrudPages';
import { usePurchaseConfig } from '@/pages/purchases/config';

export default function PurchaseList() {
  return <CrudList config={usePurchaseConfig()} />;
}