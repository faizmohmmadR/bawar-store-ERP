import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import {
  DamagedMaterialForm,
  type DamagedSubmitPayload,
} from '@/components/damaged/DamagedMaterialForm';
import { FormPage } from '@/components/forms/FormPage';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import type { DamagedMaterialRecord } from '@/types/damaged';
import { AlertOctagon } from 'lucide-react';

const EditDamagedMaterial = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useFetchObjects<DamagedMaterialRecord>({
    queryKey: ['damaged-material', id],
    endpoint: `damaged-materials/${id}`,
    enabled: !!id,
    options: { staleTime: 0 },
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['damaged-materials'],
    endpoint: 'damaged-materials',
    customSuccessMessage: t('damaged.editSuccess', 'Damaged materials updated'),
  });

  useRedirectOnSuccess(isSuccess, '/damaged');

  useEffect(() => {
    if (!data) return;
    if (data.source === 'tank_leak' || data.source === 'stock_bottle') {
      navigate(`/damaged/${id}`, { replace: true });
    }
  }, [data, id, navigate]);

  if (isLoading) {
    return (
      <FormPage title={t('damaged.edit', 'Edit damaged')} icon={<AlertOctagon />} backTo="/damaged" maxWidth="screen">
        <Skeleton className="h-64 w-full" />
      </FormPage>
    );
  }

  if (isError || !data) {
    return (
      <FormPage title={t('damaged.edit', 'Edit damaged')} icon={<AlertOctagon />} backTo="/damaged">
        <p className="text-sm text-muted-foreground">{t('damaged.notFound', 'Damaged record not found')}</p>
      </FormPage>
    );
  }

  if (data.source === 'tank_leak' || data.source === 'stock_bottle') {
    return (
      <FormPage title={t('damaged.edit', 'Edit damaged')} icon={<AlertOctagon />} backTo="/damaged">
        <Skeleton className="h-24 w-full" />
      </FormPage>
    );
  }

  const onSubmit = (payload: DamagedSubmitPayload) => {
    if (!id) return;
    handleUpdate(id, payload);
  };

  return (
    <DamagedMaterialForm
      mode="edit"
      title={`${t('damaged.edit', 'Edit damaged')} · ${data.damaged_number}`}
      loading={loading}
      initialRecord={data}
      onSubmit={onSubmit}
      onCancel={() => navigate('/damaged')}
    />
  );
};

export default EditDamagedMaterial;
