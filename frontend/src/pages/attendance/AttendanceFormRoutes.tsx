import { useNavigate, useParams } from 'react-router-dom';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import type { Attendance } from '@/types/attendance';
import AddAttendance from './AddAttendance';
import EditAttendance from './EditAttendance';
import AddLeaveRequest from './AddLeaveRequest';

export function AddAttendanceRoute() {
  const navigate = useNavigate();
  const close = () => navigate('/attendance');
  return <AddAttendance isOpen onClose={close} onSuccess={close} />;
}

export function EditAttendanceRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { data, isLoading, isError, refetch } = useFetchObjects<Attendance>({
    queryKey: ['attendance', id || ''], endpoint: `attendances/${id}`, enabled: Boolean(id),
  });
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (isError || !data) return <div className="space-y-3 p-6">
    <p>{t('common.failedToLoad', 'Could not load this record.')}</p>
    <Button variant="outline" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>
    <Button variant="ghost" onClick={() => navigate('/attendance')}>{t('common.back')}</Button>
  </div>;
  const close = () => navigate('/attendance');
  return <EditAttendance isOpen attendance={data} onClose={close} onSuccess={close} />;
}

export function AddLeaveRequestRoute() {
  const navigate = useNavigate();
  const close = () => navigate('/attendance/leave');
  return <AddLeaveRequest isOpen onClose={close} onSuccess={close} />;
}
