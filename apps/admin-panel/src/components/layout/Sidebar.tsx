import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  CreditCard,
  FileText,
  Headphones,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Palette,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import { cn } from '@commercenest/ui';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/stores', label: 'Stores', icon: Store },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/licenses', label: 'Subscriptions', icon: KeyRound },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/themes', label: 'Themes', icon: Palette },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/support', label: 'Support Tickets', icon: Headphones },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/audit-logs', label: 'System Logs', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-admin-sidebar text-slate-100">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            CN
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">CommerceNest</div>
            <div className="text-[11px] text-slate-400">Master Admin</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-cn px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="size-4 shrink-0 opacity-90" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
        Platform control plane
      </div>
    </aside>
  );
}
