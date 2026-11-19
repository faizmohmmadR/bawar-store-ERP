import { CrudForm } from '@/pages/shared/CrudPages';
import { useEquipmentConfig } from '@/pages/equipment/config';

export default function EditEquipment() {
  return <CrudForm config={useEquipmentConfig()} edit />;
}
