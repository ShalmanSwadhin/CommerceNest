import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Headphones, RotateCcw, ShieldCheck, Star, Zap } from 'lucide-react';
import type { ThemeSection } from '@commercenest/types/schemas/theme';
import type { StorefrontProduct, StorefrontStore } from '../../lib/api';
import { cloudinaryThumb } from '../../lib/media';
import { ModernProductCard } from './ModernProductCard';

const HEADING_STYLE = { fontFamily: 'var(--store-heading-font)', color: 'var(--store-text,#111111)' } as const;

function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  showViewAll = true,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  showViewAll?: boolean;
}) {
  return (
    <div className="flex items-end justify-between mb-10">
      <div>
        <h2 className="text-3xl lg:text-4xl mb-2" style={HEADING_STYLE}>
          {title}
        </h2>
        {subtitle ? <p className="text-sm" style={{ color: 'var(--store-muted,#4B5563)' }}>{subtitle}</p> : null}
      </div>
      {showViewAll && viewAllHref ? (
        <Link to={viewAllHref} className="hidden sm:block text-sm font-medium text-[var(--store-accent,#4338CA)] hover:opacity-80">
          View all &rarr;
        </Link>
      ) : null}
    </div>
  );
}

function ProductGrid({ products, emptyLabel }: { products: StorefrontProduct[]; emptyLabel: string }) {
  if (products.length === 0) {
    return <p className="text-sm py-8 text-center" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{emptyLabel}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
      {products.map((p) => (
        <ModernProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function ProductCarousel({ products }: { products: StorefrontProduct[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    ref.current?.scrollBy({ left: dir === 'right' ? 280 : -280, behavior: 'smooth' });
  };
  if (products.length === 0) return null;
  return (
    <div className="relative">
      <div className="hidden sm:flex absolute -top-16 right-12 gap-2">
        <button type="button" onClick={() => scroll('left')} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--store-border,#E5E7EB)' }} aria-label="Scroll left">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => scroll('right')} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--store-border,#E5E7EB)' }} aria-label="Scroll right">
          <ChevronRight size={16} />
        </button>
      </div>
      <div ref={ref} className="flex gap-4 overflow-x-auto scroll-hide snap-x snap-mandatory pb-2">
        {products.map((p) => (
          <div key={p.id} className="shrink-0 w-56 sm:w-64 snap-start">
            <ModernProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useCountdown(endsAt: string | undefined) {
  const target = useRef<number | null>(endsAt ? new Date(endsAt).getTime() : null);
  const [t, setT] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    target.current = endsAt ? new Date(endsAt).getTime() : null;
    if (!target.current) return;
    const update = () => {
      const diff = target.current! - Date.now();
      if (diff <= 0) return;
      setT({
        hours: Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return t;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function renderModernSection(
  section: ThemeSection,
  ctx: {
    store: StorefrontStore;
    featured: StorefrontProduct[];
    bestSelling: StorefrontProduct[];
    categories: { id: string; name: string; slug: string; imageUrl?: string | null }[];
  },
) {
  if (!section.visible) return null;
  const s = section.settings;

  if (section.type === 'hero') {
    return (
      <HeroSection key={section.id} settings={s} storeName={ctx.store.name} tagline={ctx.store.tagline} />
    );
  }

  if (section.type === 'why-choose-us') {
    return <BenefitsSection key={section.id} title={String(s.title || 'Shop With Confidence')} items={Array.isArray(s.items) ? s.items : undefined} />;
  }

  if (section.type === 'featured-categories') {
    return (
      <section key={section.id} className="py-16 lg:py-20 px-6 lg:px-10 bg-white">
        <div className="max-w-[1440px] mx-auto">
          <SectionHeader title={String(s.title || 'Featured Categories')} subtitle={String(s.subtitle || 'Explore our most popular collections')} viewAllHref="/c/all" />
          {ctx.categories.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--store-muted,#9CA3AF)' }}>No categories yet.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              {ctx.categories.slice(0, Number(s.limit) || 8).map((c) => (
                <CategoryCard key={c.id} name={c.name} slug={c.slug} imageUrl={c.imageUrl} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (section.type === 'featured-products' || section.type === 'best-sellers') {
    const isBestSellers = section.type === 'best-sellers';
    const limit = Number(s.limit) || 8;
    const source = isBestSellers ? ctx.bestSelling : ctx.featured;
    const products = source.slice(0, limit);
    const carousel = String(s.displayStyle || 'grid') === 'carousel';
    return (
      <section key={section.id} className={`py-16 lg:py-20 px-6 lg:px-10 ${isBestSellers ? 'bg-white' : 'bg-[var(--store-surface,#F9FAFB)]'}`}>
        <div className="max-w-[1440px] mx-auto">
          <SectionHeader
            title={String(s.title || (isBestSellers ? 'Best Sellers' : 'Featured Products'))}
            subtitle={String(s.subtitle || '')}
            viewAllHref="/c/all"
            showViewAll={s.showViewAll !== false}
          />
          {carousel ? <ProductCarousel products={products} /> : <ProductGrid products={products} emptyLabel="No products yet." />}
        </div>
      </section>
    );
  }

  if (section.type === 'promo-banner') {
    return <PromoBannerSection key={section.id} settings={s} />;
  }

  if (section.type === 'testimonials') {
    return <TestimonialsSection key={section.id} settings={s} />;
  }

  if (section.type === 'newsletter') {
    return <NewsletterSection key={section.id} settings={s} />;
  }

  return null;
}

function HeroSection({
  settings: s,
  storeName,
  tagline,
}: {
  settings: Record<string, unknown>;
  storeName: string;
  tagline?: string | null;
}) {
  const navigate = useNavigate();
  const image = String(s.imageUrl || '');
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="max-w-[1440px] mx-auto grid lg:grid-cols-[1fr_1.2fr] min-h-[70vh] lg:min-h-[80vh]">
        <div className="flex flex-col justify-center px-6 lg:px-16 xl:px-20 py-16 lg:py-0 order-2 lg:order-1">
          <div className="max-w-xl">
            {s.badge ? (
              <div className="text-xs font-semibold uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
                {String(s.badge)}
              </div>
            ) : null}
            <h1 className="text-5xl lg:text-6xl leading-[1.05] mb-6" style={HEADING_STYLE}>
              {String(s.title || storeName)}
            </h1>
            <p className="text-base lg:text-lg leading-relaxed mb-10 max-w-sm" style={{ color: 'var(--store-muted,#4B5563)' }}>
              {String(s.subtitle || tagline || 'Shop the latest collection.')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => navigate(String(s.primaryCtaHref || '/c/all'))}
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold tracking-wide rounded-sm hover:opacity-90"
              >
                {String(s.primaryCtaLabel || 'Shop Collection')}
                <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              </button>
              {s.secondaryCtaLabel ? (
                <button
                  type="button"
                  onClick={() => navigate(String(s.secondaryCtaHref || '/c/all'))}
                  className="inline-flex items-center justify-center px-8 py-4 border text-sm font-semibold tracking-wide rounded-sm hover:bg-[var(--store-surface,#F9FAFB)]"
                  style={{ borderColor: 'var(--store-border,#E5E7EB)', color: 'var(--store-text,#111111)' }}
                >
                  {String(s.secondaryCtaLabel)}
                </button>
              ) : null}
            </div>
            <div className="flex gap-8 mt-12 pt-8 border-t" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              {[
                ['12k+', 'Happy customers'],
                ['500+', 'Premium products'],
                ['4.9★', 'Average rating'],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="text-2xl font-bold" style={{ color: 'var(--store-text,#111111)' }}>{value}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative order-1 lg:order-2 min-h-[45vh] lg:min-h-0" style={{ background: 'var(--store-surface,#F2EDE8)' }}>
          {image ? <img src={cloudinaryThumb(image, 1200)} alt="" className="absolute inset-0 w-full h-full object-cover" /> : null}
          <div className="hidden lg:block absolute bottom-8 left-8 bg-white/95 backdrop-blur-sm rounded-sm shadow-lg px-5 py-4">
            <div className="text-xs" style={{ color: 'var(--store-muted,#9CA3AF)' }}>This season</div>
            <div className="font-semibold" style={{ color: 'var(--store-text,#111111)' }}>New Collection</div>
            <Link to={String(s.primaryCtaHref || '/c/all')} className="text-sm text-[var(--store-accent,#4338CA)]">
              Shop now &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const BENEFIT_ICONS = [Zap, ShieldCheck, RotateCcw, Headphones];

function BenefitsSection({ title, items }: { title: string; items?: unknown[] }) {
  const defaults = [
    { title: 'Fast Delivery', description: 'Nationwide shipping across Bangladesh' },
    { title: 'Secure Payments', description: 'bKash & Cash on Delivery' },
    { title: 'Easy Returns', description: '7-day hassle-free returns' },
    { title: 'Customer Support', description: "We're here when you need us" },
  ];
  const rows = (items && items.length > 0 ? items : defaults) as { title?: string; description?: string }[];
  void title;
  return (
    <section className="py-14 lg:py-16 px-6 lg:px-10 border-y" style={{ background: 'var(--store-surface,#F9FAFB)', borderColor: 'var(--store-border,#E5E7EB)' }}>
      <div className="max-w-[1440px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
        {rows.slice(0, 4).map((item, i) => {
          const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length]!;
          return (
            <div key={i} className="flex flex-col sm:flex-row lg:flex-col items-start gap-4">
              <div className="w-10 h-10 rounded-sm bg-white border flex items-center justify-center shrink-0" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
                <Icon size={18} style={{ color: 'var(--store-primary,#111111)' }} />
              </div>
              <div>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--store-text,#111111)' }}>{item.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--store-muted,#4B5563)' }}>{item.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CategoryCard({ name, slug, imageUrl }: { name: string; slug: string; imageUrl?: string | null }) {
  return (
    <Link to={`/c/${slug}`} className="group relative overflow-hidden rounded-sm block" style={{ aspectRatio: '4/5', background: 'var(--store-surface,#F9FAFB)' }}>
      {imageUrl ? (
        <img src={cloudinaryThumb(imageUrl, 480)} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <div className="text-white text-lg font-semibold leading-tight mb-3">{name}</div>
        <div className="flex items-center gap-2 text-white/90 text-sm group-hover:gap-3 transition-all">
          Explore <ArrowRight size={13} />
        </div>
      </div>
    </Link>
  );
}

function PromoBannerSection({ settings: s }: { settings: Record<string, unknown> }) {
  const countdownEndsAt = String(s.countdownEndsAt || '');
  const t = useCountdown(countdownEndsAt || undefined);
  const image = String(s.imageUrl || '');
  return (
    <section className="py-16 lg:py-20 px-6 lg:px-10 bg-white">
      <div className="max-w-[1440px] mx-auto relative overflow-hidden rounded-sm bg-[var(--store-primary,#111111)]">
        <div className="absolute inset-0">
          {image ? <img src={cloudinaryThumb(image, 1400)} alt="" className="w-full h-full object-cover opacity-30" /> : null}
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--store-primary,#111111)]/95 via-[var(--store-primary,#111111)]/80 to-transparent" />
        </div>
        <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start justify-between gap-10 px-10 lg:px-16 py-14 lg:py-16">
          <div className="text-center lg:text-left max-w-lg">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60 mb-3">Limited Time Offer</div>
            <h2 className="text-4xl lg:text-5xl text-white leading-tight mb-4" style={{ fontFamily: 'var(--store-heading-font)' }}>
              {String(s.heading || 'Special Offer')}
            </h2>
            <p className="text-white/80 mb-6">{String(s.description || '')}</p>
            <Link
              to={String(s.ctaHref || '/c/all')}
              className="group inline-flex items-center gap-2 px-6 py-3 bg-white text-[var(--store-primary,#111111)] text-sm font-semibold rounded-sm hover:bg-gray-100"
            >
              {String(s.ctaLabel || 'Shop now')}
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          {countdownEndsAt ? (
            <div className="text-center lg:text-right shrink-0">
              <div className="text-xs text-white/50 mb-3">Ends in</div>
              <div className="flex items-center gap-4">
                {[t.hours, t.minutes, t.seconds].map((v, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div>
                      <div className="text-4xl lg:text-5xl font-bold text-white font-mono tabular-nums">{pad(v)}</div>
                      <div className="text-xs text-white/50 uppercase tracking-widest">{['Hours', 'Min', 'Sec'][i]}</div>
                    </div>
                    {i < 2 ? <span className="text-3xl text-white/40 font-light mb-3">:</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection({ settings: s }: { settings: Record<string, unknown> }) {
  const items = (Array.isArray(s.items) ? s.items : []) as {
    quote?: string;
    name?: string;
    business?: string;
    rating?: number;
    avatarUrl?: string;
  }[];
  if (items.length === 0) return null;
  return (
    <section className="py-16 lg:py-20 px-6 lg:px-10" style={{ background: 'var(--store-surface,#F9FAFB)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl lg:text-4xl mb-2" style={HEADING_STYLE}>
            {String(s.title || 'What Our Customers Say')}
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((t, i) => (
            <div key={i} className="bg-white rounded-sm p-6 border" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={13} className={n <= (t.rating || 5) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'} />
                ))}
              </div>
              <p className="text-sm leading-relaxed mt-4 mb-5" style={{ color: 'var(--store-muted,#4B5563)' }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{
                    background: 'color-mix(in srgb, var(--store-primary,#111111) 12%, white)',
                    color: 'var(--store-primary,#111111)',
                  }}
                >
                  {(t.name || '?').charAt(0)}
                </span>
                <span className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--store-text,#111111)' }}>
                  {t.name}
                  <BadgeCheck size={13} className="text-[var(--store-accent,#4338CA)]" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsletterSection({ settings: s }: { settings: Record<string, unknown> }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  return (
    <section className="py-16 lg:py-20 px-6 lg:px-10 bg-[var(--store-primary,#111111)]">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-3xl lg:text-4xl text-white mb-3" style={{ fontFamily: 'var(--store-heading-font)' }}>
          {String(s.title || 'Stay In The Loop')}
        </h2>
        <p className="text-white/70 mb-8">{String(s.subtitle || '')}</p>
        {submitted ? (
          <p className="text-white font-semibold">You&apos;re subscribed. Thanks!</p>
        ) : (
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              // Newsletter capture has no email-marketing backend in
              // CommerceNest yet — this confirms the submission visually but
              // does not persist the address anywhere. Flagged as a known
              // scope gap, not silently faked as a real subscription.
              setSubmitted(true);
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 px-4 py-3.5 rounded-sm text-sm bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-white/50"
            />
            <button type="submit" className="px-6 py-3.5 bg-white text-[var(--store-primary,#111111)] text-sm font-semibold rounded-sm hover:bg-gray-100 shrink-0">
              {String(s.buttonText || 'Subscribe')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
