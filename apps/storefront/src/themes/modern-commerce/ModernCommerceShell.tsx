import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Clock,
  Facebook,
  Heart,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Menu,
  Minus,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { storefrontApi, type StorefrontCategory, type StorefrontProduct, type StorefrontStore, type ThemeSettings } from '../../lib/api';
import { formatBdt } from '../../lib/format';
import { cloudinaryThumb } from '../../lib/media';
import { useStoreSlug } from '../../lib/storeSlug';
import { useCartStore, cartTotal } from '../../stores/cartStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useAuthStore } from '../../stores/authStore';

type OutletCtx = { slug: string; store?: StorefrontStore; theme?: ThemeSettings };

function unwrapCategories(payload: unknown): StorefrontCategory[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const obj = payload as { data?: unknown[]; items?: unknown[] };
  return (obj.data || obj.items || []) as StorefrontCategory[];
}

// ---------------------------------------------------------------------------
// Announcement bar
// ---------------------------------------------------------------------------

function AnnouncementBar({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();
  if (!visible || !text) return null;
  return (
    <div className="bg-[var(--store-primary,#111111)] text-white text-xs text-center py-2.5 px-8 relative">
      <span>
        {text}{' '}
        <button
          type="button"
          className="underline underline-offset-2 font-semibold hover:no-underline"
          onClick={() => navigate('/c/all')}
        >
          Shop Now &rarr;
        </button>
      </span>
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
        aria-label="Dismiss announcement"
        onClick={() => setVisible(false)}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function Navbar({
  store,
  logoUrl,
  categories,
  cartCount,
  wishlistCount,
  onOpenCart,
  onOpenSearch,
  mobileOpen,
  setMobileOpen,
}: {
  store?: StorefrontStore;
  logoUrl?: string;
  categories: StorefrontCategory[];
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenSearch: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const storeName = store?.name || 'Store';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/c/all', label: 'Shop' },
    { to: '/c/all?sort=newest', label: 'New Arrivals' },
    { to: '/track', label: 'Track Order' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 bg-white transition-shadow duration-200 ${
        scrolled ? 'shadow-[0_1px_0_#E5E7EB,0_4px_12px_rgba(0,0,0,0.04)]' : 'border-b'
      }`}
      style={{ borderColor: scrolled ? undefined : 'var(--store-border,#E5E7EB)' }}
    >
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <button type="button" className="p-3 -ml-3 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <Link to="/" className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className="h-8 object-contain" />
            ) : (
              <>
                <span className="w-8 h-8 bg-[var(--store-primary,#111111)] rounded-sm flex items-center justify-center text-white text-xs font-bold tracking-widest">
                  {storeName.slice(0, 2).toUpperCase()}
                </span>
                <span className="font-semibold text-sm tracking-tight hidden sm:block" style={{ color: 'var(--store-text,#111111)' }}>
                  {storeName.toUpperCase()}
                </span>
              </>
            )}
          </Link>
        </div>

        <nav className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `text-sm ${isActive ? 'font-semibold text-[var(--store-text,#111111)]' : 'text-[var(--store-muted,#4B5563)] hover:text-[var(--store-text,#111111)]'} transition-colors`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {categories.length > 0 ? (
            <div className="relative group">
              <button type="button" className="flex items-center gap-1 text-sm text-[var(--store-muted,#4B5563)] hover:text-[var(--store-text,#111111)]">
                Categories
                <ChevronDown size={13} />
              </button>
              <div
                className="absolute top-full left-0 mt-2 w-48 bg-white border rounded-sm shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150"
                style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
              >
                {categories.slice(0, 8).map((c) => (
                  <Link
                    key={c.id}
                    to={`/c/${c.slug}`}
                    className="block px-4 py-2.5 text-sm text-[var(--store-muted,#4B5563)] hover:text-[var(--store-text,#111111)] hover:bg-[var(--store-surface,#F9FAFB)] transition-colors"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="flex items-center gap-1">
          <button type="button" className="p-3" onClick={onOpenSearch} aria-label="Search">
            <Search size={18} />
          </button>
          <Link to="/account" className="p-3 hidden sm:flex" aria-label="Account">
            <User size={18} />
          </Link>
          <Link to="/account/wishlist" className="p-2.5 relative hidden sm:flex" aria-label="Wishlist">
            <Heart size={18} />
            {wishlistCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {wishlistCount}
              </span>
            ) : null}
          </Link>
          <button type="button" className="p-2.5 relative" onClick={onOpenCart} aria-label="Cart">
            <ShoppingCart size={18} />
            {cartCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-[var(--store-primary,#111111)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="drawer-overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="drawer-panel-left w-72 bg-white flex flex-col">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <span className="font-semibold">Menu</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 p-5 overflow-y-auto space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center py-3 text-sm font-medium border-b border-border/50"
                  style={{ color: 'var(--store-text,#111111)' }}
                >
                  {link.label}
                </Link>
              ))}
              {categories.length > 0 ? (
                <div className="pt-4">
                  <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
                    Categories
                  </div>
                  {categories.slice(0, 8).map((c) => (
                    <Link key={c.id} to={`/c/${c.slug}`} className="flex items-center py-3 text-sm" style={{ color: 'var(--store-muted,#4B5563)' }}>
                      {c.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </nav>
          </aside>
        </div>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Search overlay
// ---------------------------------------------------------------------------

function SearchOverlay({
  open,
  onClose,
  slug,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  categories: StorefrontCategory[];
}) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    else setQuery('');
  }, [open]);

  const resultsQ = useQuery({
    queryKey: ['storefront', slug, 'mc-search', query],
    queryFn: () => storefrontApi.search(slug, query),
    enabled: open && query.trim().length >= 2,
  });
  const results: StorefrontProduct[] = (() => {
    const data = resultsQ.data as unknown;
    if (!data) return [];
    if (Array.isArray(data)) return data as StorefrontProduct[];
    return (data as { items?: StorefrontProduct[] }).items || [];
  })();

  if (!open) return null;

  const runSearch = () => {
    if (!query.trim()) return;
    navigate(`/c/all?search=${encodeURIComponent(query.trim())}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ animation: 'slideUp 200ms ease' }}>
      <div className="border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Search size={18} style={{ color: 'var(--store-muted,#9CA3AF)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search products..."
            className="flex-1 text-base outline-none bg-transparent"
            style={{ color: 'var(--store-text,#111111)' }}
          />
          <button type="button" className="p-1.5 hover:bg-[var(--store-surface,#F9FAFB)] rounded-sm" onClick={onClose} aria-label="Close search">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {query.trim().length >= 2 ? (
            results.length > 0 ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
                  Results for &quot;{query}&quot;
                </div>
                <div className="space-y-1">
                  {results.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center gap-4 p-3 rounded-sm hover:bg-[var(--store-surface,#F9FAFB)] transition-colors text-left"
                      onClick={() => {
                        navigate(`/p/${p.slug}`);
                        onClose();
                      }}
                    >
                      <span className="w-12 h-14 rounded-sm overflow-hidden shrink-0" style={{ background: 'var(--store-surface,#F9FAFB)' }}>
                        {p.images?.[0]?.url ? (
                          <img src={cloudinaryThumb(p.images[0].url, 96)} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold line-clamp-1" style={{ color: 'var(--store-text,#111111)' }}>
                          {p.name}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{p.category?.name}</span>
                      </span>
                      <span className="text-sm font-bold" style={{ color: 'var(--store-text,#111111)' }}>{formatBdt(p.basePrice)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--store-text,#111111)' }}>No results for &quot;{query}&quot;</p>
                <p className="text-sm mt-1" style={{ color: 'var(--store-muted,#9CA3AF)' }}>Try a different search term.</p>
              </div>
            )
          ) : (
            <div className="grid sm:grid-cols-2 gap-10">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
                  <Clock size={13} />
                  Recent Searches
                </div>
                <p className="text-sm" style={{ color: 'var(--store-muted,#4B5563)' }}>Your recent searches will appear here.</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
                  <TrendingUp size={13} />
                  Browse Categories
                </div>
                {categories.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex items-center justify-between w-full py-1 text-sm"
                    style={{ color: 'var(--store-muted,#4B5563)' }}
                    onClick={() => {
                      navigate(`/c/${c.slug}`);
                      onClose();
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cart drawer
// ---------------------------------------------------------------------------

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="drawer-overlay" aria-label="Close cart" onClick={onClose} />
      <aside className="drawer-panel w-full max-w-md bg-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBag size={18} />
            Your Cart
            {items.length > 0 ? (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--store-surface,#F9FAFB)', color: 'var(--store-muted,#4B5563)' }}>
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            ) : null}
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="h-full px-6 py-16 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--store-surface,#F9FAFB)' }}>
              <ShoppingBag size={24} style={{ color: 'var(--store-muted,#9CA3AF)' }} />
            </div>
            <p className="font-semibold" style={{ color: 'var(--store-text,#111111)' }}>Your cart is empty</p>
            <p className="text-sm mt-1 mb-6" style={{ color: 'var(--store-muted,#9CA3AF)' }}>Add items to get started.</p>
            <button
              type="button"
              className="px-6 py-3 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold rounded-sm hover:opacity-90"
              onClick={() => {
                navigate('/c/all');
                onClose();
              }}
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              {items.map((item) => (
                <div key={item.variantId} className="flex gap-4 p-5">
                  <div
                    className="w-20 h-24 shrink-0 rounded-sm overflow-hidden cursor-pointer"
                    style={{ background: 'var(--store-surface,#F9FAFB)' }}
                    onClick={() => {
                      navigate(`/p/${item.slug}`);
                      onClose();
                    }}
                  >
                    {item.imageUrl ? (
                      <img src={cloudinaryThumb(item.imageUrl, 160)} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="text-sm font-semibold leading-snug line-clamp-2 cursor-pointer hover:text-[var(--store-accent,#4338CA)]"
                        style={{ color: 'var(--store-text,#111111)' }}
                        onClick={() => {
                          navigate(`/p/${item.slug}`);
                          onClose();
                        }}
                      >
                        {item.name}
                      </span>
                      <button type="button" onClick={() => removeItem(item.variantId)} aria-label="Remove">
                        <Trash2 size={14} style={{ color: 'var(--store-muted,#9CA3AF)' }} />
                      </button>
                    </div>
                    {item.color ? <div className="text-xs mt-0.5" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{item.color}</div> : null}
                    {item.size ? <div className="text-xs" style={{ color: 'var(--store-muted,#9CA3AF)' }}>Size: {item.size}</div> : null}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border rounded-sm" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
                        <button type="button" className="w-7 h-7 flex items-center justify-center" onClick={() => setQuantity(item.variantId, item.quantity - 1)}>
                          <Minus size={11} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button type="button" className="w-7 h-7 flex items-center justify-center" onClick={() => setQuantity(item.variantId, item.quantity + 1)}>
                          <Plus size={11} />
                        </button>
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--store-text,#111111)' }}>
                        {formatBdt(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-5 space-y-3" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Subtotal</span>
                <span>{formatBdt(cartTotal(items))}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--store-muted,#9CA3AF)' }}>Shipping calculated at checkout</p>
              <button
                type="button"
                className="w-full py-3.5 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold rounded-sm hover:opacity-90"
                onClick={() => {
                  navigate('/checkout');
                  onClose();
                }}
              >
                Checkout &middot; {formatBdt(cartTotal(items))}
              </button>
              <button
                type="button"
                className="w-full text-center text-sm font-medium"
                style={{ color: 'var(--store-accent,#4338CA)' }}
                onClick={() => {
                  navigate('/cart');
                  onClose();
                }}
              >
                View full cart
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom nav
// ---------------------------------------------------------------------------

function MobileBottomNav({ cartCount, onOpenSearch, onOpenCart }: { cartCount: number; onOpenSearch: () => void; onOpenCart: () => void }) {
  const location = useLocation();
  const tabClass = (active: boolean, accent = false) =>
    `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 ${
      active
        ? accent
          ? 'text-[var(--store-accent,#4338CA)] font-semibold'
          : 'text-[var(--store-primary,#111111)] font-semibold'
        : ''
    }`;
  const mutedStyle = { color: 'var(--store-muted,#9CA3AF)' };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-30 lg:hidden flex" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
      <Link to="/" className={tabClass(location.pathname === '/')} style={location.pathname === '/' ? undefined : mutedStyle}>
        <ShoppingBag size={20} />
        <span className="text-[10px] mt-0.5">Home</span>
      </Link>
      <Link to="/c/all" className={tabClass(location.pathname.startsWith('/c/'))} style={location.pathname.startsWith('/c/') ? undefined : mutedStyle}>
        <Search size={20} />
        <span className="text-[10px] mt-0.5">Shop</span>
      </Link>
      <button type="button" className={tabClass(false, true)} style={mutedStyle} onClick={onOpenSearch}>
        <Search size={20} />
        <span className="text-[10px] mt-0.5">Search</span>
      </button>
      <Link to="/account" className={tabClass(location.pathname === '/account')} style={location.pathname === '/account' ? undefined : mutedStyle}>
        <User size={20} />
        <span className="text-[10px] mt-0.5">Account</span>
      </Link>
      <button type="button" className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative" style={mutedStyle} onClick={onOpenCart}>
        <ShoppingCart size={20} />
        {cartCount > 0 ? (
          <span className="absolute -top-0 right-6 w-3.5 h-3.5 bg-[var(--store-primary,#111111)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {cartCount}
          </span>
        ) : null}
        <span className="text-[10px] mt-0.5">Cart</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer({ store, slug }: { store?: StorefrontStore; slug: string }) {
  const socialQ = useQuery({
    queryKey: ['storefront', slug, 'cms', 'social-links'],
    queryFn: () => storefrontApi.cms(slug, 'social-links'),
    enabled: !!slug,
  });
  const social = socialQ.data?.fields as
    | { facebook?: string; instagram?: string; whatsapp?: string }
    | undefined;
  const contactQ = useQuery({
    queryKey: ['storefront', slug, 'cms', 'contact-info'],
    queryFn: () => storefrontApi.cms(slug, 'contact-info'),
    enabled: !!slug,
  });
  const contact = contactQ.data?.fields as
    | { address?: string; phone?: string; email?: string }
    | undefined;
  const columns: { title: string; links: { label: string; to: string }[] }[] = [
    {
      title: 'Shop',
      links: [
        { label: 'All Products', to: '/c/all' },
        { label: 'New Arrivals', to: '/c/all?sort=newest' },
        { label: 'Track Order', to: '/track' },
      ],
    },
    {
      title: 'Help',
      links: [
        { label: 'Contact Us', to: '/pages/contact' },
        { label: 'Shipping Policy', to: '/pages/shipping' },
        { label: 'Returns', to: '/pages/returns' },
        { label: 'FAQ', to: '/pages/faq' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About Us', to: '/pages/about' },
        { label: 'Privacy Policy', to: '/pages/privacy' },
        { label: 'Terms & Conditions', to: '/pages/terms' },
      ],
    },
  ];

  return (
    <footer className="bg-[var(--store-primary,#111111)] text-white">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="py-8 lg:py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 bg-white/10 rounded-sm flex items-center justify-center text-white text-xs font-bold tracking-widest">
                {(store?.name || 'ST').slice(0, 2).toUpperCase()}
              </span>
              <span className="font-semibold text-sm tracking-tight">{(store?.name || 'Store').toUpperCase()}</span>
            </div>
            <p className="text-white/60 text-sm leading-relaxed mb-6 max-w-xs">
              {store?.tagline || 'Quality products, curated for the way you live.'}
            </p>
            {contact?.address || contact?.phone || contact?.email ? (
              <div className="space-y-2 text-sm text-white/60">
                {contact.address ? (
                  <div className="flex items-center gap-2">
                    <MapPin size={13} />
                    <span>{contact.address}</span>
                  </div>
                ) : null}
                {contact.phone ? (
                  <div className="flex items-center gap-2">
                    <Phone size={13} />
                    <span>{contact.phone}</span>
                  </div>
                ) : null}
                {contact.email ? (
                  <div className="flex items-center gap-2">
                    <Mail size={13} />
                    <span>{contact.email}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="block py-1.5 text-sm text-white/70 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Connect</div>
            {social?.facebook || social?.instagram || social?.whatsapp ? (
              <div className="flex gap-3 mb-6">
                {social.facebook ? (
                  <a
                    href={social.facebook}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Facebook"
                    className="w-9 h-9 bg-white/10 rounded-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <Facebook size={13} />
                  </a>
                ) : null}
                {social.instagram ? (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                    className="w-9 h-9 bg-white/10 rounded-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <Instagram size={13} />
                  </a>
                ) : null}
                {social.whatsapp ? (
                  <a
                    href={social.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                    className="w-9 h-9 bg-white/10 rounded-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <MessageCircle size={15} />
                  </a>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-white/40 leading-relaxed">Follow us for updates, new arrivals, and exclusive offers.</p>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div>&copy; {new Date().getFullYear()} {store?.name || 'Store'}. All rights reserved.</div>
          <div className="flex items-center gap-2">
            {['VISA', 'MC', 'bKash', 'Nagad'].map((p) => (
              <span key={p} className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-bold tracking-wide">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function ModernCommerceShell({
  store,
  theme,
  outletTheme,
}: {
  store?: StorefrontStore;
  theme: { announcement?: string; logoUrl?: string };
  outletTheme: OutletCtx['theme'];
}) {
  const { slug } = useStoreSlug();
  const { customer } = useAuthStore();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const wishlistIds = useWishlistStore((s) => s.productIds);
  const setWishlistIds = useWishlistStore((s) => s.setIds);
  const loaded = useWishlistStore((s) => s.loaded);

  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const catsQ = useQuery({
    queryKey: ['storefront', slug, 'categories'],
    queryFn: () => storefrontApi.categories(slug),
    enabled: !!slug,
  });
  const categories = unwrapCategories(catsQ.data);

  useEffect(() => {
    if (customer && slug && !loaded) {
      void storefrontApi
        .wishlist(slug)
        .then((res) => setWishlistIds(res.items.map((i) => i.product.id)))
        .catch(() => undefined);
    }
  }, [customer, slug, loaded, setWishlistIds]);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--store-bg,#F9FAFB)' }}>
      <AnnouncementBar text={theme.announcement || ''} />
      <Navbar
        store={store}
        logoUrl={theme.logoUrl}
        categories={categories}
        cartCount={cartCount}
        wishlistCount={wishlistIds.size}
        onOpenCart={() => setCartOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="flex-1 pb-16 lg:pb-0">
        <Outlet context={{ slug, store, theme: outletTheme }} />
      </main>
      <Footer store={store} slug={slug} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} slug={slug} categories={categories} />
      <MobileBottomNav cartCount={cartCount} onOpenSearch={() => setSearchOpen(true)} onOpenCart={() => setCartOpen(true)} />
    </div>
  );
}
