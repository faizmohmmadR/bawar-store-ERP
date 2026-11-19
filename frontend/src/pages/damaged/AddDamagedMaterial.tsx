import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useAdd from '@/api/useAdd';
import {
  DamagedMaterialForm,
  type DamagedSubmitPayload,
} from '@/components/damaged/DamagedMaterialForm';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';

const AddDamagedMaterial = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const resetRef = useRef<() => void>(() => undefined);

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['damaged-materials'],
    endpoint: 'damaged-materials/',
    customSuccessMessage: t('damaged.addSuccess', 'Damaged materials saved'),
  });

  const onReset = useCallback(() => {
    resetRef.current();
  }, []);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/damaged',
    onReset,
  });

  const onSubmit = (payload: DamagedSubmitPayload) => {
    handleAdd(payload);
  };

  return (
    <DamagedMaterialForm
      mode="create"
      title={t('damaged.add', 'Add damaged')}
      loading={loading}
      onSubmit={onSubmit}
      onCancel={() => navigate('/damaged')}
      showSaveAndCreateNew={showSaveAndCreateNew}
      onIntent={onIntent}
      onResetReady={(reset) => {
        resetRef.current = reset;
      }}
    />
  );
};

export default AddDamagedMaterial;
