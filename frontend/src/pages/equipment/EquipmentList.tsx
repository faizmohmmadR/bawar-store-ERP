import { CrudList } from '@/pages/shared/CrudPages';
import { useEquipmentConfig } from '@/pages/equipment/config';

export default function EquipmentList() {
  return <CrudList config={useEquipmentConfig()} />;
}
