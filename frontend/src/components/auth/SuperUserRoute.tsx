import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export const SuperUserRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user?.is_superuser) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
