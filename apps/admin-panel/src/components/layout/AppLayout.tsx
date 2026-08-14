import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { ImpersonationBanner } from './ImpersonationBanner';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/stores': 'Stores',
  '/users': 'Users',
  '/themes': 'Theme Editor',
  '/payments': 'Payments',
  '/analytics': 'Analytics',
  '/licenses': 'Subscriptions',
  '/audit-logs': 'System Logs',
  '/announcements': 'Announcements',
  '/support': 'Support Tickets',
  '/settings': 'Settings',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title =
    titles[pathname] ||
    (pathname.startsWith('/themes/') ? 'Theme Editor' : 'CommerceNest');

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        <Navbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <ImpersonationBanner />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
