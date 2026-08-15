import { memo, useCallback } from 'react';
import {
  resolveDesignSystem,
  resolveSectionBackground,
  type ResolvedDesignSystem,
  type ThemeDocument,
  type ThemeSection,
} from '@commercenest/types/schemas/theme';
import { SectionBackground } from '@commercenest/ui';

/** Design-system button-style token → concrete classes for a CTA that sits on
 * a photo/gradient background (matches the storefront's own `primaryCtaClass`). */
function primaryCtaClass(buttonStyle: ResolvedDesignSystem['buttonStyle']): string {
  if (buttonStyle === 'outline') return 'border border-white/70 bg-transparent text-white';
  if (buttonStyle === 'ghost') return 'bg-transparent text-white underline-offset-2 underline';
  return 'bg-white text-slate-900';
}

type Device = 'desktop' | 'tablet' | 'mobile';

const widths: Record<Device, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

type ThemeLivePreviewProps = {
  doc: ThemeDocument;
  device: Device;
  storeName: string;
  selectedSectionId?: string | null;
  onSelectSection?: (id: string) => void;
};

/**
 * Memoized — with many sections, every SectionBlock previously reconstructed
 * its full JSX (gradients, template literals, nested markup) on any theme
 * change anywhere, including edits to unrelated sections. Sections whose own
 * props haven't changed now skip that work entirely. `onSelect` takes the
 * section id so the parent can hand every block the same stable function
 * reference instead of a fresh per-item closure, which is what makes this
 * memoization actually take effect.
 */
const SectionBlock = memo(function SectionBlock({
  section,
  colors,
  designSystem,
  storeName,
  selected,
  onSelect,
}: {
  section: ThemeSection;
  colors: ThemeDocument['themeSettings']['colors'];
  designSystem: ResolvedDesignSystem;
  storeName: string;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  if (!section.visible) return null;
  const s = section.settings;
  const ring = selected ? 'ring-2 ring-[#6C1DB3] ring-offset-2' : '';
  const handleSelect = () => onSelect?.(section.id);
  const cardStyle = { borderRadius: designSystem.radiusPx, boxShadow: designSystem.shadowCss };

  if (section.type === 'hero') {
    const layout = String(s.layout || 'content-left');
    const bg = resolveSectionBackground(s);
    return (
      <button
        type="button"
        onClick={handleSelect}
        className={`relative block w-full overflow-hidden text-left ${ring}`}
        style={{ minHeight: s.height === 'sm' ? 220 : s.height === 'md' ? 280 : 340 }}
      >
        <SectionBackground
          type={bg.backgroundType}
          image={bg.image}
          position={bg.position}
          color={colors.primary}
          gradientFrom={colors.primary}
          gradientTo="#0B1023"
          overlayType={bg.overlayType}
          overlayColor={bg.overlayColor}
          overlayOpacity={bg.overlayOpacity}
          className="absolute inset-0"
        />
        <div
          className={`relative mx-auto flex max-w-5xl flex-col justify-end px-6 py-10 text-white ${
            layout === 'centered' ? 'items-center text-center' : 'items-start'
          }`}
          style={{ minHeight: s.height === 'sm' ? 220 : s.height === 'md' ? 280 : 340 }}
        >
          {s.badge ? (
            <span className="mb-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
              {String(s.badge)}
            </span>
          ) : null}
          <h2 className="max-w-lg text-2xl font-bold tracking-tight md:text-3xl">
            {String(s.title || storeName || 'Hero title')}
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/85">
            {String(s.subtitle || 'Supporting text for your campaign')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${primaryCtaClass(designSystem.buttonStyle)}`}>
              {String(s.primaryCtaLabel || 'Shop Now')}
            </span>
            {s.secondaryCtaLabel ? (
              <span className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white">
                {String(s.secondaryCtaLabel)}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  if (section.type === 'featured-categories') {
    return (
      <button type="button" onClick={handleSelect} className={`w-full bg-white px-6 py-8 text-left ${ring}`}>
        <h3 className="text-lg font-bold" style={{ color: colors.text }}>
          {String(s.title || 'Shop by Category')}
        </h3>
        <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
          {Array.from({ length: Number(s.limit || 6) })
            .slice(0, 6)
            .map((_, i) => (
              <div key={i} className="text-center">
                <div
                  className="mx-auto mb-1.5 h-12 w-12 rounded-full"
                  style={{ background: `${colors.primary}22` }}
                />
                <p className="text-[10px]" style={{ color: colors.mutedText }}>
                  Category {i + 1}
                </p>
              </div>
            ))}
        </div>
      </button>
    );
  }

  if (section.type === 'featured-products' || section.type === 'best-sellers') {
    const cols = Number(s.columns || 4);
    return (
      <button type="button" onClick={handleSelect} className={`w-full px-6 py-8 text-left ${ring}`} style={{ background: colors.background }}>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="text-lg font-bold" style={{ color: colors.text }}>
              {String(s.title || 'Products')}
            </h3>
            {s.subtitle ? (
              <p className="text-xs" style={{ color: colors.mutedText }}>
                {String(s.subtitle)}
              </p>
            ) : null}
          </div>
          {s.showViewAll ? (
            <span className="text-xs font-semibold" style={{ color: colors.primary }}>
              View all
            </span>
          ) : null}
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: Math.min(Number(s.limit || 4), 4) }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden border bg-white"
              style={{ borderColor: colors.border, ...cardStyle }}
            >
              <div className="aspect-square" style={{ background: `${colors.primary}18` }} />
              <div className="p-2">
                <p className="text-xs font-semibold" style={{ color: colors.text }}>
                  Product {i + 1}
                </p>
                <p className="text-xs font-bold" style={{ color: colors.primary }}>
                  ৳{(i + 1) * 999}
                </p>
              </div>
            </div>
          ))}
        </div>
      </button>
    );
  }

  if (section.type === 'promo-banner') {
    const bg = resolveSectionBackground(s);
    return (
      <button
        type="button"
        onClick={handleSelect}
        className={`relative mx-6 my-4 block w-[calc(100%-3rem)] overflow-hidden text-left text-white ${ring}`}
        style={{ borderRadius: designSystem.radiusPx }}
      >
        <SectionBackground
          type={bg.backgroundType}
          image={bg.image}
          position={bg.position}
          color={colors.primary}
          gradientFrom={colors.primary}
          gradientTo={colors.accent}
          overlayType={bg.overlayType}
          overlayColor={bg.overlayColor}
          overlayOpacity={bg.overlayOpacity}
          className="absolute inset-0"
        />
        <div className="relative px-6 py-10">
          <h3 className="text-xl font-bold">{String(s.heading || 'Promo')}</h3>
          <p className="mt-1 text-sm text-white/85">{String(s.description || '')}</p>
          <span className={`mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold ${primaryCtaClass(designSystem.buttonStyle)}`}>
            {String(s.ctaLabel || 'Shop now')}
          </span>
        </div>
      </button>
    );
  }

  if (section.type === 'why-choose-us') {
    const items = Array.isArray(s.items) ? s.items : [];
    const imageUrl = String(s.imageUrl || '');
    const imageOnLeft = String(s.imagePosition || 'right') === 'left';
    if (!imageUrl) {
      return (
        <button type="button" onClick={handleSelect} className={`w-full bg-white px-6 py-8 text-left ${ring}`}>
          <h3 className="text-lg font-bold" style={{ color: colors.text }}>
            {String(s.title || 'Why choose us')}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.slice(0, 4).map((item, i) => {
              const row = item as { title?: string; description?: string };
              return (
                <div key={i} className="border p-3" style={{ borderColor: colors.border, borderRadius: designSystem.radiusPx }}>
                  <p className="text-sm font-bold" style={{ color: colors.text }}>
                    {row.title}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: colors.mutedText }}>
                    {row.description}
                  </p>
                </div>
              );
            })}
          </div>
        </button>
      );
    }
    const checklist = (
      <div>
        <h3 className="text-lg font-bold" style={{ color: colors.text }}>
          {String(s.title || 'Why choose us')}
        </h3>
        <ul className="mt-3 space-y-2">
          {items.slice(0, 4).map((item, i) => {
            const row = item as { title?: string; description?: string };
            return (
              <li key={i} className="flex items-start gap-2">
                <span
                  className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] text-white"
                  style={{ background: colors.primary }}
                >
                  ✓
                </span>
                <p className="text-xs font-semibold" style={{ color: colors.text }}>
                  {row.title}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    );
    const photo = (
      <div
        className="aspect-[4/3] w-full overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})`, borderRadius: designSystem.radiusPx }}
      />
    );
    return (
      <button type="button" onClick={handleSelect} className={`w-full bg-white px-6 py-8 text-left ${ring}`}>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
          {imageOnLeft ? (
            <>
              {photo}
              {checklist}
            </>
          ) : (
            <>
              {checklist}
              {photo}
            </>
          )}
        </div>
      </button>
    );
  }

  if (section.type === 'testimonials') {
    const items = Array.isArray(s.items) ? s.items : [];
    const bg = resolveSectionBackground(s);
    const hasBackground = bg.backgroundType !== 'none';
    return (
      <button type="button" onClick={handleSelect} className={`relative block w-full overflow-hidden text-left ${ring}`}>
        {hasBackground ? (
          <SectionBackground
            type={bg.backgroundType}
            image={bg.image}
            position={bg.position}
            color={colors.primary}
            gradientFrom={colors.primary}
            gradientTo="#0B1023"
            overlayType={bg.overlayType}
            overlayColor={bg.overlayColor}
            overlayOpacity={bg.overlayOpacity}
            className="absolute inset-0"
          />
        ) : null}
        <div
          className="relative px-6 py-8"
          style={{ background: hasBackground ? undefined : colors.background }}
        >
          <h3 className="text-lg font-bold" style={{ color: hasBackground ? '#fff' : colors.text }}>
            {String(s.title || 'Testimonials')}
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {items.slice(0, 3).map((item, i) => {
              const row = item as { quote?: string; name?: string; business?: string };
              return (
                <div
                  key={i}
                  className={hasBackground ? 'bg-white/10 p-3 backdrop-blur-sm' : 'border bg-white p-3'}
                  style={
                    hasBackground
                      ? { borderRadius: designSystem.radiusPx }
                      : { borderColor: colors.border, ...cardStyle }
                  }
                >
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: hasBackground ? 'rgba(255,255,255,0.85)' : colors.mutedText }}
                  >
                    “{row.quote}”
                  </p>
                  <p
                    className="mt-2 text-xs font-bold"
                    style={{ color: hasBackground ? '#fff' : colors.text }}
                  >
                    {row.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </button>
    );
  }

  if (section.type === 'newsletter') {
    return (
      <button
        type="button"
        onClick={handleSelect}
        className={`mx-6 my-6 w-[calc(100%-3rem)] px-6 py-8 text-left text-white ${ring}`}
        style={{ background: colors.primary, borderRadius: designSystem.radiusPx }}
      >
        <h3 className="text-lg font-bold">{String(s.title || 'Newsletter')}</h3>
        <p className="mt-1 text-sm text-white/85">{String(s.subtitle || '')}</p>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-lg bg-white/15 px-3 py-2 text-xs text-white/70">
            you@email.com
          </span>
          <span className={`rounded-lg px-3 py-2 text-xs font-semibold ${primaryCtaClass(designSystem.buttonStyle)}`}>
            {String(s.buttonText || 'Subscribe')}
          </span>
        </div>
      </button>
    );
  }

  return null;
});

export function ThemeLivePreview({
  doc,
  device,
  storeName,
  selectedSectionId,
  onSelectSection,
}: ThemeLivePreviewProps) {
  const { themeSettings, layout } = doc;
  const colors = themeSettings.colors;
  const branding = themeSettings.branding;
  const header = themeSettings.header;
  const footer = themeSettings.footer;
  const radius = String(themeSettings.cornerRadius || 12);
  const designSystem = resolveDesignSystem(themeSettings);
  // Stable across renders so SectionBlock's memoization isn't defeated by a
  // fresh closure every time (colors/typography edits shouldn't force every
  // section to redo its JSX construction).
  const handleSelectSection = useCallback(
    (id: string) => onSelectSection?.(id),
    [onSelectSection],
  );

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-auto bg-[#E8EAF0] p-4">
      {/* shrink-0 is load-bearing: this div's parent is a flex column with
          overflow-auto, and flex items default to flex-shrink: 1 — without
          shrink-0, the browser compresses this frame down to whatever
          space is available instead of letting it keep its natural content
          height, so the parent never sees an overflow to scroll and the
          compressed (and `overflow-hidden`) frame silently clips everything
          past the fold instead. shrink-0 lets it stay its full height so
          the parent's overflow-auto has something real to scroll. */}
      <div
        className="min-h-[640px] w-full shrink-0 overflow-hidden border border-black/5 bg-white shadow-xl transition-all"
        style={{
          maxWidth: widths[device],
          borderRadius: 16,
          fontFamily: themeSettings.typography.bodyFont,
          fontWeight: themeSettings.typography.bodyWeight,
          ['--preview-heading-font' as string]:
            themeSettings.typography.headingFont || themeSettings.typography.bodyFont,
          ['--preview-heading-weight' as string]: themeSettings.typography.headingWeight,
        }}
      >
        <style>{`
          h1, h2, h3 {
            font-family: var(--preview-heading-font) !important;
            font-weight: var(--preview-heading-weight) !important;
          }
        `}</style>
        {branding.announcement ? (
          <div
            className="px-3 py-1.5 text-center text-[11px] text-white"
            style={{ background: colors.primary }}
          >
            {branding.announcement}
          </div>
        ) : null}

        <header
          className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
            header.style === 'minimal' ? 'bg-transparent' : 'bg-white'
          }`}
          style={{ borderColor: colors.border }}
        >
          <div className="flex items-center gap-2">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
            ) : (
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white"
                style={{ background: colors.primary }}
              >
                CN
              </span>
            )}
            <span className="text-sm font-bold" style={{ color: colors.text }}>
              {storeName}
            </span>
          </div>
          <div className="hidden items-center gap-3 text-xs md:flex" style={{ color: colors.mutedText }}>
            <span>Shop</span>
            <span>Track</span>
            {header.showAccount ? <span>Account</span> : null}
            {header.showCart ? <span>Cart</span> : null}
          </div>
        </header>

        {layout.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            colors={colors}
            designSystem={designSystem}
            storeName={storeName}
            selected={selectedSectionId === section.id}
            onSelect={handleSelectSection}
          />
        ))}

        <footer
          className="border-t px-4 py-6 text-xs"
          style={{ borderColor: colors.border, background: '#0B1023', color: '#CBD5E1' }}
        >
          <p className="font-semibold text-white">{storeName}</p>
          <p className="mt-1 max-w-sm text-[11px] text-slate-400">
            {footer.description || 'Your store description'}
          </p>
          <p className="mt-4 text-[10px] text-slate-500">Powered by CommerceNest</p>
          <div
            className="mt-2 inline-block rounded px-2 py-0.5 text-[10px]"
            style={{ background: `${colors.primary}33`, color: '#E9D5FF' }}
          >
            radius {radius}px
          </div>
        </footer>
      </div>
    </div>
  );
}
