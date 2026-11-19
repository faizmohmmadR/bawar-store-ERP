import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { getRouteAccess } from '@/lib/routePermissions';
import { isHqAdminUser } from '@/lib/apps';

type RoutePermissionGuardProps = {
  children: React.ReactNode;
};

export const RoutePermissionGuard = ({ children }: RoutePermissionGuardProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();

  const access = getRouteAccess(location.pathname);
  if (!access) {
    return <>{children}</>;
  }

  if (access.superuserOnly && !user?.is_superuser) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (access.hqOnly && !isHqAdminUser(user)) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  let allowed = false;
  if (access.permission) {
    allowed = hasPermission(access.permission);
  } else if (access.permissions?.length) {
    allowed = hasAnyPermission(access.permissions);
  } else {
    allowed = true;
  }

  if (!allowed) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
