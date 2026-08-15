import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { formatDate } from '../../lib/format';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => adminApi.listNotifications({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const markAllMut = useMutation({
    mutationFn: () => adminApi.markAllNotificationsRead(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => adminApi.markNotificationRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unreadCount = q.data?.unreadCount ?? 0;
  const items = q.data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative rounded-md p-2 text-ink-secondary hover:bg-black/5"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: 'var(--cn-color-danger)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface-base shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => markAllMut.mutate()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-secondary">
                No notifications yet.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface-raised ${
                    n.readAt ? '' : 'bg-primary/[0.04]'
                  }`}
                  onClick={() => {
                    if (!n.readAt) markOneMut.mutate(n.id);
                    if (n.type === 'trial_lead_created') navigate('/trial-leads');
                    setOpen(false);
                  }}
                >
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-secondary">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink-tertiary">{formatDate(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
