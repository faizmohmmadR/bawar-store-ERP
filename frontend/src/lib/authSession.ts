import type { User } from '@/contexts/AuthContext';

const VALID_ROLES = ['admin', 'staff', 'customer', 'vendor', 'user', 'employee'] as const;
export type AuthRole = (typeof VALID_ROLES)[number];

type LoginApiUser = {
  id?: number | string;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  profile_picture?: string;
  role?: string;
  is_buyer?: boolean;
  is_seller?: boolean;
  is_finance?: boolean;
  is_admin?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  is_staff?: boolean;
  permissions?: string[];
  employee_id?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

export type LoginApiResponse = {
  token?: string;
  user?: LoginApiUser;
};

export function resolveAuthRole(
  raw: unknown,
  flags?: { is_admin?: boolean; is_superuser?: boolean },
): AuthRole {
  const role = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((VALID_ROLES as readonly string[]).includes(role)) {
    return role as AuthRole;
  }
  if (flags?.is_superuser || flags?.is_admin) {
    return 'admin';
  }
  return 'staff';
}

export function extractAuthToken(data: LoginApiResponse | null | undefined): string {
  if (!data) return '';
  const token = data.token ?? (data.user as { token?: string } | undefined)?.token;
  return token ? String(token).trim() : '';
}

export function mapLoginUser(data: LoginApiResponse): Omit<User, 'token'> {
  const apiUser = data.user ?? {};
  const firstName = apiUser.first_name ?? '';
  const lastName = apiUser.last_name ?? '';
  const email = String(apiUser.email ?? '').trim();
  const role = resolveAuthRole(apiUser.role, {
    is_admin: apiUser.is_admin,
    is_superuser: apiUser.is_superuser,
  });

  return {
    id: String(apiUser.id ?? ''),
    username: apiUser.username ?? '',
    email,
    name: `${firstName} ${lastName}`.trim() || email || 'User',
    first_name: firstName,
    last_name: lastName,
    phone: apiUser.phone ?? '',
    address: apiUser.address ?? '',
    profile_picture: apiUser.profile_picture ?? '',
    role,
    is_buyer: apiUser.is_buyer ?? false,
    is_seller: apiUser.is_seller ?? false,
    is_finance: apiUser.is_finance ?? false,
    is_admin: apiUser.is_admin ?? false,
    is_superuser: apiUser.is_superuser ?? false,
    is_active: apiUser.is_active ?? true,
    is_staff: apiUser.is_staff ?? false,
    permissions: apiUser.permissions ?? [],
    employee_id: apiUser.employee_id ?? null,
    created_at: apiUser.created_at ?? new Date().toISOString(),
    updated_at: apiUser.updated_at ?? new Date().toISOString(),
  };
}

export function buildSessionUser(
  base: User & { token: string },
): User | null {
  const token = String(base.token ?? '').trim();
  const email = String(base.email ?? '').trim();
  const id = String(base.id ?? '').trim();
  if (!token || !email || !id) return null;

  const role = resolveAuthRole(base.role, {
    is_admin: base.is_admin,
    is_superuser: base.is_superuser,
  });

  const session: User = {
    ...base,
    id,
    email,
    token,
    role,
  };
  return session;
}

export function isCompleteSessionUser(user: Partial<User> | null | undefined): user is User {
  if (!user) return false;
  const id = String(user.id ?? '').trim();
  const email = String(user.email ?? '').trim();
  const token = String(user.token ?? '').trim();
  const role = resolveAuthRole(user.role, {
    is_admin: user.is_admin,
    is_superuser: user.is_superuser,
  });
  return (
    !!id &&
    !!email &&
    !!token &&
    (VALID_ROLES as readonly string[]).includes(role)
  );
}

export function normalizeStoredUser(raw: Partial<User>): User | null {
  const token = String(raw.token ?? '').trim();
  const email = String(raw.email ?? '').trim();
  const id = String(raw.id ?? '').trim();
  if (!token || !email || !id) return null;

  const role = resolveAuthRole(raw.role, {
    is_admin: raw.is_admin,
    is_superuser: raw.is_superuser,
  });

  const normalized: User = {
    ...(raw as User),
    id,
    email,
    token,
    role,
    permissions: raw.permissions ?? [],
    is_buyer: raw.is_buyer ?? false,
    is_seller: raw.is_seller ?? false,
    is_finance: raw.is_finance ?? false,
    is_admin: raw.is_admin ?? false,
    is_superuser: raw.is_superuser ?? false,
    is_active: raw.is_active ?? true,
    is_staff: raw.is_staff ?? false,
    name: raw.name ?? email,
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
  };

  return normalized;
}
