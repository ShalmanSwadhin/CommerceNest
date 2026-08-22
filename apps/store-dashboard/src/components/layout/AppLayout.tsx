import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button } from '@commercenest/ui';
import { LogOut, Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { ImpersonationBanner } from './ImpersonationBanner';
import { storeApi } from '../../lib/api';
import { useAuthStore, useStoreId } from '../../stores/authStore';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const storeId = useStoreId();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const storeQ = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => storeApi.getStore(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const domain =
    storeQ.data?.domains?.find((d) => d.isPrimary)?.hostname ||
    storeQ.data?.domains?.[0]?.hostname ||
    (storeQ.data?.slug ? `${storeQ.data.slug}.commercenest.local` : '-');

  return (
    <div className="flex h-screen overflow-hidden bg-surface-raised">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full shadow-lg">
            <Sidebar />
            <button
              type="button"
              className="absolute right-3 top-4 rounded-md bg-white/10 p-1.5 text-white"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-white px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-md p-2 text-ink-secondary hover:bg-black/5 md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">
                {storeQ.data?.name || 'Your store'}
              </div>
              <div className="truncate text-xs text-ink-secondary">{domain}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-ink-secondary">{user?.role}</div>
            </div>
            <Avatar name={user?.name || 'Staff'} size="sm" />
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<LogOut className="size-4" />}
              onClick={async () => {
                try {
                  await storeApi.logout();
                } catch {
                  /* ignore */
                }
                clearSession();
              }}
            >
              Logout
            </Button>
          </div>
        </header>
        <ImpersonationBanner />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
