import { Avatar, Button } from '@commercenest/ui';
import { LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { adminApi } from '../../lib/api';

export function Navbar({
  title,
  onMenuClick,
}: {
  title?: string;
  onMenuClick?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const logout = async () => {
    try {
      await adminApi.logout();
    } catch {
      /* ignore */
    }
    clearSession();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-surface-base px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onMenuClick ? (
          <button
            type="button"
            className="rounded-md p-2 text-ink-secondary hover:bg-black/5 md:hidden"
            aria-label="Open navigation"
            onClick={onMenuClick}
          >
            <Menu className="size-5" />
          </button>
        ) : null}
        <h1 className="truncate text-sm font-semibold text-ink">{title || 'Overview'}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-ink">{user?.name}</div>
          <div className="text-xs text-ink-secondary">{user?.email}</div>
        </div>
        <Avatar name={user?.name || 'Admin'} size="sm" />
        <Button size="sm" variant="ghost" leftIcon={<LogOut className="size-4" />} onClick={logout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
