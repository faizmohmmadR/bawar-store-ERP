import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { AppFooter } from './MadeByCredit';
import { RoutePermissionGuard } from '@/components/auth/RoutePermissionGuard';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export const Layout: React.FC = () => {
  const { direction } = useLanguage();

  return (
    <div className={cn('flex h-dvh flex-col overflow-hidden bg-background', direction)}>
      <Header />
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-muted/30 pb-4">
        <RoutePermissionGuard>
          <Outlet />
        </RoutePermissionGuard>
      </main>
      <AppFooter />
    </div>
  );
};
