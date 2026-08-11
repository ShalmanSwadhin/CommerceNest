import {
  Activity,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Palette,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import { homeContent } from '@/content/home';

const chartPoints = [
  { label: 'Jan', value: 42 },
  { label: 'Feb', value: 55 },
  { label: 'Mar', value: 48 },
  { label: 'Apr', value: 72 },
  { label: 'May', value: 68 },
  { label: 'Jun', value: 90 },
  { label: 'Jul', value: 84 },
];

function MiniRevenueChart() {
  const w = 320;
  const h = 78;
  const max = Math.max(...chartPoints.map((p) => p.value));
  const coords = chartPoints.map((p, i) => {
    const x = (i / (chartPoints.length - 1)) * w;
    const y = h - (p.value / max) * (h - 8) - 4;
    return { x, y, ...p };
  });
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1]!.x} ${h} L 0 ${h} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" aria-hidden>
        <defs>
          <linearGradient id="hero-rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6C1DB3" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6C1DB3" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#hero-rev-fill)" />
        <path
          d={line}
          fill="none"
          stroke="#6C1DB3"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <circle key={c.label} cx={c.x} cy={c.y} r="2.8" fill="#6C1DB3" />
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between px-0.5">
        {chartPoints.map((p) => (
          <span key={p.label} className="text-[7px] text-slate-400">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Stores', icon: Store, active: false },
  { label: 'Users', icon: Users, active: false },
  { label: 'Payments', icon: CreditCard, active: false },
  { label: 'Themes', icon: Palette, active: false },
  { label: 'Analytics', icon: BarChart3, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

/** Dense Master Admin UI rendered inside the laptop screen (demo preview). */
export function HeroDashboardPreview() {
  const data = homeContent.dashboardPreview;

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden bg-[#F8FAFC] text-left"
      aria-hidden
    >
      <aside className="flex w-[86px] shrink-0 flex-col bg-[#0F172A] px-2 py-2.5 sm:w-[118px] sm:px-2.5 sm:py-3">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#6C1DB3] text-[9px] font-bold text-white">
            CN
          </span>
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-[9px] font-bold leading-tight text-white">
              CommerceNest
            </p>
            <p className="truncate text-[7px] text-slate-400">Master Admin</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[8px] font-medium sm:text-[9px] ${
                  item.active
                    ? 'bg-[#6C1DB3] text-white'
                    : 'text-slate-400'
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                <span className="hidden truncate sm:inline">{item.label}</span>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto rounded-md bg-white/5 px-1.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#6C1DB3]/20 text-[7px] font-bold text-violet-200">
              A
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[8px] font-semibold text-white">Admin</p>
              <p className="truncate text-[7px] text-slate-500">Platform</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-2.5 py-1.5 sm:px-3">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-wider text-[#6C1DB3]">
              CommerceNest
            </p>
            <h3 className="text-[11px] font-bold text-slate-900 sm:text-[12px]">
              Welcome back, Admin
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[7px] font-semibold text-emerald-700">
              Demo data
            </span>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100">
              <Activity className="h-2.5 w-2.5 text-slate-500" />
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-2 sm:p-2.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {data.kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm"
              >
                <p className="truncate text-[7px] font-medium text-slate-500 sm:text-[8px]">
                  {kpi.label}
                </p>
                <p className="mt-0.5 text-[12px] font-bold leading-none tracking-tight text-slate-900">
                  {kpi.value}
                </p>
                <p className="mt-0.5 text-[7px] font-semibold text-emerald-600">{kpi.delta}</p>
              </div>
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-[1.35fr_1fr] gap-1.5">
            <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[9px] font-bold text-slate-900">Revenue Overview</p>
                <p className="text-[7px] text-slate-400">Sample series</p>
              </div>
              <MiniRevenueChart />
            </div>

            <div className="space-y-1.5">
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                <p className="mb-1 text-[9px] font-bold text-slate-900">Recent Stores</p>
                <ul className="space-y-1">
                  {data.recentStores.map((store) => (
                    <li
                      key={store.name}
                      className="flex items-center justify-between gap-1"
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-[#F3E8FF] text-[7px] font-bold text-[#6C1DB3]">
                          {store.name.slice(0, 1)}
                        </span>
                        <span className="truncate text-[8px] font-semibold text-slate-700">
                          {store.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-[7px] text-slate-400">
                        {store.orders}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                <p className="mb-1 text-[9px] font-bold text-slate-900">Recent Activity</p>
                <ul className="space-y-1">
                  {data.activity.map((line) => (
                    <li
                      key={line}
                      className="truncate border-l-2 border-[#6C1DB3]/40 pl-1.5 text-[7px] leading-snug text-slate-500"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
