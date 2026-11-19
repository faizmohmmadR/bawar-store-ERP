import { Route } from 'react-router-dom';
import { UserList } from '@/pages/users/UserList';
import AddUser from '@/pages/users/AddUser';
import EditUser from '@/pages/users/EditUser';
import { UserDetails } from '@/pages/users/UserDetails';
import { UserPermissions } from '@/pages/users/UserPermissions';
import { PermissionRoute } from '@/components/auth/PermissionRoute';

export const userRoutes = (
  <>
    <Route
      path="users"
      element={
        <PermissionRoute permission="view_users">
          <UserList />
        </PermissionRoute>
      }
    />
    <Route
      path="users/add"
      element={
        <PermissionRoute permission="add_users">
          <AddUser />
        </PermissionRoute>
      }
    />
    <Route
      path="users/:id"
      element={
        <PermissionRoute permission="view_users">
          <UserDetails />
        </PermissionRoute>
      }
    />
    <Route
      path="users/:id/edit"
      element={
        <PermissionRoute permission="edit_users">
          <EditUser />
        </PermissionRoute>
      }
    />
    <Route
      path="users/:id/permissions"
      element={
        <PermissionRoute permissions={['view_permissions', 'edit_permissions']}>
          <UserPermissions />
        </PermissionRoute>
      }
    />
  </>
);
