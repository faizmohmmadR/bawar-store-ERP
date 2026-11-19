import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { isHqAdminUser } from '@/lib/apps';

type PermissionRouteProps = {
  children: React.ReactNode;
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  superuserOnly?: boolean;
  /** Hide from branch-scoped staff (HQ / admin only). */
  hqOnly?: boolean;
};

export const PermissionRoute = ({
  children,
  permission,
  permissions,
  requireAll = false,
  superuserOnly = false,
  hqOnly = false,
}: PermissionRouteProps) => {
  const { user, isLoading } = useAuth();
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  if (isLoading) {
    return null;
  }

  if (superuserOnly) {
    return user?.is_superuser ? <>{children}</> : <Navigate to="/" replace />;
  }

  if (hqOnly && !isHqAdminUser(user)) {
    return <Navigate to="/" replace />;
  }

  let allowed = false;
  if (permission) {
    allowed = hasPermission(permission);
  } else if (permissions?.length) {
    allowed = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  } else {
    allowed = true;
  }

  return allowed ? <>{children}</> : <Navigate to="/" replace />;
};
