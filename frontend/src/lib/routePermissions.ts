import { ERP_APPS } from '@/lib/apps';

export type RouteAccessRule = {
  pathPrefix: string;
  permission?: string;
  permissions?: string[];
  superuserOnly?: boolean;
  hqOnly?: boolean;
};

const PUBLIC_PATHS = new Set(['/', '', '/profile']);

const EXTRA_ROUTE_RULES: RouteAccessRule[] = [
  { pathPrefix: '/payments', permissions: ['view_sale_payments', 'view_purchase_payments', 'view_payments'] },
];

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
}

function collectRulesFromApps(): RouteAccessRule[] {
  const rules: RouteAccessRule[] = [];

  for (const app of ERP_APPS) {
    const entries = [
      {
        path: app.path,
        permission: app.permission,
        permissions: app.permissions,
        superuserOnly: false,
        hqOnly: !!app.hqOnly,
      },
      ...(app.subItems ?? []).map((sub) => ({
        path: sub.path,
        permission: sub.permission,
        permissions: sub.permissions,
        superuserOnly: sub.superuserOnly ?? false,
        hqOnly: !!app.hqOnly,
      })),
    ];

    for (const entry of entries) {
      if (!entry.permission && !entry.permissions?.length && !entry.superuserOnly && !entry.hqOnly) continue;
      rules.push({
        pathPrefix: entry.path,
        permission: entry.permission,
        permissions: entry.permissions ? [...entry.permissions] : undefined,
        superuserOnly: entry.superuserOnly,
        hqOnly: entry.hqOnly,
      });
    }
  }

  return rules;
}

const ROUTE_RULES: RouteAccessRule[] = [...collectRulesFromApps(), ...EXTRA_ROUTE_RULES].sort(
  (a, b) => b.pathPrefix.length - a.pathPrefix.length,
);

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRouteAccess(pathname: string): RouteAccessRule | null {
  const normalized = normalizePath(pathname);
  if (PUBLIC_PATHS.has(normalized)) {
    return null;
  }

  if (normalized.endsWith('/permissions')) {
    return {
      pathPrefix: normalized,
      permissions: ['view_permissions', 'edit_permissions'],
      hqOnly: false,
    };
  }

  for (const rule of ROUTE_RULES) {
    if (pathMatchesPrefix(normalized, rule.pathPrefix)) {
      return rule;
    }
  }

  return null;
}
