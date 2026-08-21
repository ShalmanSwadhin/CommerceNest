import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  CreditCard,
  FileImage,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Package,
  Palette,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Star,
  Tags,
  Ticket,
  Users,
} from 'lucide-react';
import { cn } from '@commercenest/ui';
import { canAccess, type NavKey } from '../../lib/rbac';
import { useAuthStore } from '../../stores/authStore';

const nav: Array<{ to: string; label: string; icon: typeof LayoutDashboard; key: NavKey; end?: boolean }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard', end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingCart, key: 'orders' },
  { to: '/products', label: 'Products', icon: Package, key: 'products' },
  { to: '/categories', label: 'Categories', icon: Tags, key: 'categories' },
  { to: '/coupons', label: 'Coupons', icon: Ticket, key: 'coupons' },
  { to: '/returns', label: 'Returns', icon: RotateCcw, key: 'returns' },
  { to: '/reviews', label: 'Reviews', icon: Star, key: 'reviews' },
  { to: '/customers', label: 'Customers', icon: Users, key: 'customers' },
  { to: '/payments', label: 'Payments', icon: CreditCard, key: 'payments' },
  { to: '/billing', label: 'Billing', icon: Receipt, key: 'billing' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, key: 'analytics' },
  { to: '/cms', label: 'CMS', icon: Boxes, key: 'cms' },
  { to: '/media', label: 'Media', icon: FileImage, key: 'media' },
  { to: '/theme', label: 'Theme', icon: Palette, key: 'theme' },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, key: 'announcements' },
  { to: '/support', label: 'Support', icon: LifeBuoy, key: 'support' },
  { to: '/settings', label: 'Settings', icon: Settings, key: 'settings' },
];

export function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-admin-sidebar text-slate-100">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            CN
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">CommerceNest</div>
            <div className="text-[11px] text-slate-400">Store Admin</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav
          .filter((item) => canAccess(role, item.key))
          .map((item) => {
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
    </aside>
  );
}
