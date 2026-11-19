import { CrudForm } from '@/pages/shared/CrudPages';
import { useEquipmentConfig } from '@/pages/equipment/config';

export default function AddEquipment() {
  return <CrudForm config={useEquipmentConfig()} />;
}
