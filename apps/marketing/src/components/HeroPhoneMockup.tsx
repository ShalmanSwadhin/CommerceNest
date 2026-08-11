import {
  Home,
  LayoutGrid,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { homeContent } from '@/content/home';

const categories = [
  { label: 'Phones', tone: 'from-violet-500 to-fuchsia-500' },
  { label: 'Audio', tone: 'from-sky-500 to-blue-600' },
  { label: 'Wearables', tone: 'from-amber-400 to-orange-500' },
  { label: 'Accessories', tone: 'from-emerald-400 to-teal-600' },
];

/**
 * Realistic smartphone frame showing a CommerceNest-powered TechWorld BD storefront.
 */
export function HeroPhoneMockup() {
  const data = homeContent.mobilePreview;

  return (
    <div className="hero-phone relative w-full select-none" aria-hidden>
      <div className="pointer-events-none absolute inset-x-[-10%] bottom-[-8%] top-[40%] -z-10 rounded-full bg-[#6C1DB3]/30 blur-2xl" />

      <div className="animate-float relative">
        {/* Outer metal frame — taller aspect (~15% longer vertically) */}
        <div className="aspect-[9/20.5] rounded-[1.85rem] bg-gradient-to-b from-[#3a3f4d] via-[#1a1d26] to-[#0b0d12] p-[2.5px] shadow-[0_28px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          <div className="flex h-full flex-col rounded-[1.7rem] bg-black p-[6px]">
            {/* Side buttons hints */}
            <div className="absolute -left-[2px] top-16 h-7 w-[2px] rounded-l-full bg-[#4b5160]" />
            <div className="absolute -left-[2px] top-28 h-10 w-[2px] rounded-l-full bg-[#4b5160]" />
            <div className="absolute -right-[2px] top-24 h-12 w-[2px] rounded-r-full bg-[#4b5160]" />

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] bg-white">
              {/* Dynamic Island */}
              <div className="absolute left-1/2 top-1.5 z-20 h-3.5 w-[64px] -translate-x-1/2 rounded-full bg-black" />

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 pb-0.5 pt-2 text-[7px] font-semibold text-slate-900">
                <span>9:41</span>
                <span className="flex items-center gap-0.5 text-[6px] text-slate-500">
                  <span className="h-1.5 w-2.5 rounded-[1px] border border-slate-700" />
                  <span className="h-2 w-0.5 rounded-sm bg-slate-700" />
                </span>
              </div>

              {/* Store header */}
              <div className="flex items-center justify-between px-2 pb-1">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#6C1DB3] text-[7px] font-bold text-white">
                    TW
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[8px] font-bold leading-tight text-slate-900">
                      {data.storeName}
                    </p>
                    <p className="truncate text-[6px] text-slate-400">Powered by CommerceNest</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-slate-600">
                  <ShoppingBag className="h-3 w-3" />
                  <UserRound className="h-3 w-3" />
                </div>
              </div>

              {/* Search */}
              <div className="px-2 pb-1.5">
                <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[7px] text-slate-400">
                  <Search className="h-2.5 w-2.5" />
                  <span>Search products…</span>
                </div>
              </div>

              {/* Promo banner */}
              <div className="mx-2 overflow-hidden rounded-lg bg-gradient-to-br from-[#6C1DB3] to-[#A855F7] px-2 py-2 text-white shadow-sm">
                <p className="text-[6px] font-semibold uppercase tracking-wide text-white/80">
                  Limited offer
                </p>
                <p className="text-[9px] font-extrabold leading-tight">{data.banner}</p>
                <span className="mt-1 inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[6px] font-semibold">
                  Shop now
                </span>
              </div>

              {/* Categories */}
              <div className="mt-2 px-2">
                <p className="mb-1 text-[7px] font-bold text-slate-800">Categories</p>
                <div className="grid grid-cols-4 gap-0.5">
                  {categories.map((cat) => (
                    <div key={cat.label} className="text-center">
                      <div
                        className={`mx-auto mb-0.5 h-6 w-6 rounded-full bg-gradient-to-br ${cat.tone} opacity-90`}
                      />
                      <p className="truncate text-[5.5px] font-medium text-slate-600">
                        {cat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Featured products fill remaining height */}
              <div className="mt-2 flex min-h-0 flex-1 flex-col px-2 pb-1.5">
                <p className="mb-1 text-[7px] font-bold text-slate-800">Featured Products</p>
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
                  {data.products.slice(0, 4).map((p, i) => (
                    <div
                      key={p.name}
                      className="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-100 bg-slate-50"
                    >
                      <div
                        className="min-h-[36px] flex-1 w-full"
                        style={{
                          background: `linear-gradient(145deg, hsl(${265 + i * 18} 70% 88%), hsl(${250 + i * 12} 40% 78%))`,
                        }}
                      />
                      <div className="shrink-0 p-1">
                        <p className="truncate text-[6.5px] font-semibold text-slate-800">
                          {p.name}
                        </p>
                        <p className="text-[7px] font-bold text-[#6C1DB3]">{p.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom nav */}
              <div className="mt-auto flex items-center justify-around border-t border-slate-100 bg-white px-1 py-1.5 text-slate-500">
                <Home className="h-3 w-3 text-[#6C1DB3]" />
                <LayoutGrid className="h-3 w-3" />
                <ShoppingBag className="h-3 w-3" />
                <UserRound className="h-3 w-3" />
              </div>

              {/* Home indicator */}
              <div className="flex justify-center bg-white pb-1.5 pt-0.5">
                <div className="h-0.5 w-12 rounded-full bg-slate-900/80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
