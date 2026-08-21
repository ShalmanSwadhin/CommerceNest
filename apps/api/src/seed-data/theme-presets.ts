import type { ThemeSection, ThemeSectionType } from '@commercenest/types/schemas/theme';

export interface ThemePresetSeed {
  name: string;
  category: string;
  description: string;
  displayOrder: number;
  colors: Partial<{
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
  }>;
  typographyPreset: 'modern' | 'elegant' | 'minimal' | 'bold' | 'classic';
  headerStyle: 'solid' | 'minimal' | 'centered';
  sections: { type: ThemeSectionType; settings?: Record<string, unknown> }[];
  /** Selects the storefront rendering tree — omit (or 'default') for every
   * existing preset, which keeps using the shared generic renderer
   * unchanged. Only a preset built for a specific purpose-built component
   * tree (apps/storefront/src/themes/) sets this. */
  templateId?: 'default' | 'modern-commerce';
}

function section(
  type: ThemeSectionType,
  settings: Record<string, unknown> = {},
): Omit<ThemeSection, 'id'> {
  return { type, visible: true, settings };
}

/**
 * Prebuilt storefront layouts — each is a real structural arrangement of
 * the Theme Builder's existing section types (see
 * packages/types/src/schemas/theme.ts#themeSectionTypeSchema), not just a
 * different color swatch. Applied to a store's DRAFT via
 * theme-preset.service.ts#applyThemePresetToStore; Master Admin reviews and
 * publishes explicitly.
 */
export const THEME_PRESETS: ThemePresetSeed[] = [
  {
    name: 'Electronics Pro',
    category: 'Electronics',
    description: 'Designed for electronics, gadgets and technology stores.',
    displayOrder: 1,
    colors: { primary: '#1D4ED8', secondary: '#0EA5E9', accent: '#F59E0B', background: '#F5F7FB' },
    typographyPreset: 'modern',
    headerStyle: 'solid',
    sections: [
      section('hero', { badge: 'New Arrivals', title: 'The Latest Tech, Delivered Fast', subtitle: 'Genuine gadgets, warranty included.', layout: 'content-left', height: 'lg', backgroundType: 'image', imageUrl: 'https://cdn.stocksnap.io/img-thumbs/960w/X4AAF4SU9Q.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 55 }),
      section('featured-categories', { title: 'Shop by Category', limit: 6 }),
      section('best-sellers', { title: 'Best Sellers', subtitle: 'Most-loved gadgets this month', columns: 4, limit: 8 }),
      section('promo-banner', { heading: 'Deals of the Week', description: 'Up to 30% off selected accessories.', ctaLabel: 'Shop deals', backgroundType: 'image', imageUrl: 'https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA0L3Vwd2s2MTgwMzYxMC13aWtpbWVkaWEtaW1hZ2Uta293cTFicm0uanBn.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 50 }),
      section('featured-products', { title: 'New Arrivals', columns: 4, limit: 8, showViewAll: true }),
      section('newsletter', { title: 'Get restock alerts', subtitle: 'Be first to know when new stock lands.' }),
    ],
  },
  {
    name: 'Fashion Edit',
    category: 'Fashion',
    description: 'A editorial, lookbook-style layout for apparel and accessories stores.',
    displayOrder: 2,
    colors: { primary: '#BE185D', secondary: '#111827', accent: '#F5D0C5', background: '#FFFFFF' },
    typographyPreset: 'elegant',
    headerStyle: 'centered',
    sections: [
      section('hero', { badge: '', title: 'The New Collection', subtitle: 'Curated looks for every season.', layout: 'centered', height: 'lg', backgroundType: 'image', imageUrl: 'https://live.staticflickr.com/65535/50179598477_3f83909320_b.jpg', backgroundPosition: 'top', overlayType: 'dark', overlay: 35 }),
      section('featured-categories', { title: 'Collections', limit: 6 }),
      section('featured-products', { title: 'New Arrivals', columns: 3, limit: 6 }),
      section('promo-banner', { heading: 'The Lookbook', description: 'See how our community styles this season.', ctaLabel: 'View lookbook', backgroundType: 'image', imageUrl: 'https://cdn.stocksnap.io/img-thumbs/960w/ZN97ZIF3ZU.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 45 }),
      section('best-sellers', { title: 'Most Loved', columns: 4, limit: 8 }),
      section('newsletter', { title: 'Join the list', subtitle: 'Early access to drops and private sales.' }),
    ],
  },
  {
    name: 'Fresh Grocery',
    category: 'Grocery',
    description: 'Built for grocery and daily-essentials stores with fast repeat ordering.',
    displayOrder: 3,
    colors: { primary: '#16A34A', secondary: '#84CC16', accent: '#F59E0B', background: '#F7FBF6' },
    typographyPreset: 'modern',
    headerStyle: 'solid',
    sections: [
      section('hero', { badge: 'Free delivery over 999 Tk', title: 'Groceries at Your Doorstep', subtitle: 'Fresh produce, daily essentials, same-day delivery.', layout: 'content-left', height: 'md', backgroundType: 'image', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Healthy_Grocery_Shopping_%28Unsplash%29.jpg/960px-Healthy_Grocery_Shopping_%28Unsplash%29.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 45 }),
      section('featured-categories', { title: 'Shop by Aisle', limit: 6 }),
      section('promo-banner', { heading: "Today's Deals", description: 'Fresh discounts, updated daily.', ctaLabel: 'See deals', backgroundType: 'image', imageUrl: 'https://cdn.stocksnap.io/img-thumbs/960w/UW8AKAGQI3.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 45 }),
      section('featured-products', { title: 'Popular Products', columns: 4, limit: 8 }),
      section('why-choose-us', {
        title: 'Fresh Picks, Every Time',
        items: [
          { title: 'Same-day delivery', description: 'Order before 6pm for delivery today.' },
          { title: 'Quality guaranteed', description: "Not fresh? We'll replace it free." },
          { title: 'Easy returns', description: 'No-hassle returns on damaged items.' },
        ],
      }),
      section('newsletter', { title: 'Weekly offers in your inbox', subtitle: 'No spam, just the best deals.' }),
    ],
  },
  {
    name: 'Beauty & Glow',
    category: 'Beauty & Cosmetics',
    description: 'A soft, premium layout for beauty, skincare and cosmetics stores.',
    displayOrder: 4,
    colors: { primary: '#C026D3', secondary: '#FDA4AF', accent: '#FDE68A', background: '#FFF7FB' },
    typographyPreset: 'elegant',
    headerStyle: 'minimal',
    sections: [
      section('hero', { title: 'Glow Starts Here', subtitle: 'Skincare and beauty essentials, curated for you.', layout: 'centered', height: 'lg' }),
      section('featured-products', { title: 'Bestselling Beauty', columns: 4, limit: 8 }),
      section('featured-categories', { title: 'Shop by Category', limit: 6 }),
      section('testimonials', { title: 'Loved by our customers' }),
      section('promo-banner', { heading: 'Skincare Routine Sets', description: 'Save when you bundle your routine.', ctaLabel: 'Shop sets' }),
      section('newsletter', { title: 'Beauty tips & offers', subtitle: 'Join our glow list.' }),
    ],
  },
  {
    name: 'Restaurant & Cafe',
    category: 'Restaurant/Food',
    description: 'A warm, appetite-driven layout for restaurants, cafes and food delivery.',
    displayOrder: 5,
    colors: { primary: '#B45309', secondary: '#DC2626', accent: '#FACC15', background: '#FFFBF5' },
    typographyPreset: 'bold',
    headerStyle: 'solid',
    sections: [
      section('hero', { badge: 'Now delivering', title: 'Great Food, Delivered Hot', subtitle: 'Order your favorites in minutes.', layout: 'content-left', height: 'lg', backgroundType: 'image', imageUrl: 'https://cdn.stocksnap.io/img-thumbs/960w/JSFGN9B9CV.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 55 }),
      section('featured-categories', { title: 'Menu Categories', limit: 6 }),
      section('featured-products', { title: 'Popular Dishes', columns: 4, limit: 8 }),
      section('why-choose-us', {
        title: 'Why Dine With Us',
        items: [
          { title: 'Fast delivery', description: 'Hot food, delivered in 30 minutes.' },
          { title: 'Fresh ingredients', description: 'Cooked to order, every time.' },
          { title: 'Easy ordering', description: 'Reorder your favorites in one tap.' },
        ],
      }),
      section('testimonials', { title: 'What our customers say' }),
      section('newsletter', { title: 'Get our weekly specials', subtitle: 'New dishes and offers every week.' }),
    ],
  },
  {
    name: 'Mobile & Accessories',
    category: 'Mobile/Accessories',
    description: 'Optimized for mobile phone and accessories retailers.',
    displayOrder: 6,
    colors: { primary: '#4338CA', secondary: '#0EA5E9', accent: '#22D3EE', background: '#F6F7FF' },
    typographyPreset: 'modern',
    headerStyle: 'solid',
    sections: [
      section('hero', { badge: 'Authorized reseller', title: 'Phones & Accessories You Can Trust', subtitle: 'Genuine products, official warranty.', layout: 'content-left', height: 'lg', backgroundType: 'image', imageUrl: 'https://live.staticflickr.com/65535/48124824108_30127fec67_b.jpg', backgroundPosition: 'center', overlayType: 'dark', overlay: 50 }),
      section('best-sellers', { title: 'Best Selling Phones', columns: 4, limit: 8 }),
      section('featured-categories', { title: 'Shop by Brand', limit: 6 }),
      section('promo-banner', { heading: 'Accessory Bundles', description: 'Case + screen protector, save 20%.', ctaLabel: 'Shop bundles', backgroundType: 'color' }),
      section('featured-products', { title: 'New Arrivals', columns: 4, limit: 8 }),
      section('newsletter', { title: 'Get launch-day alerts', subtitle: 'Know the moment new stock drops.' }),
    ],
  },
  {
    name: 'General Business',
    category: 'General Business',
    description: 'A flexible, professional layout suited to almost any product catalog.',
    displayOrder: 7,
    colors: { primary: '#0F766E', secondary: '#F59E0B', accent: '#8B5CF6', background: '#F7F8FB' },
    typographyPreset: 'modern',
    headerStyle: 'solid',
    sections: [
      section('hero', { title: 'Welcome to Our Store', subtitle: 'Quality products, trusted service.', layout: 'content-left', height: 'md' }),
      section('why-choose-us', {
        title: 'Why Shop With Us',
        items: [
          { title: 'Trusted service', description: 'Thousands of happy customers.' },
          { title: 'Secure checkout', description: 'Cash on delivery and manual bKash.' },
          { title: 'Responsive support', description: "We're here when you need us." },
        ],
      }),
      section('featured-products', { title: 'Featured Products', columns: 4, limit: 8 }),
      section('testimonials', { title: 'What customers say' }),
      section('newsletter', { title: 'Stay in the loop', subtitle: 'Offers and updates, straight to your inbox.' }),
    ],
  },
  {
    name: 'Minimal Store',
    category: 'Minimal Product Store',
    description: 'A clean, distraction-free layout that puts the product catalog first.',
    displayOrder: 8,
    colors: { primary: '#111827', secondary: '#6B7280', accent: '#111827', background: '#FFFFFF' },
    typographyPreset: 'minimal',
    headerStyle: 'minimal',
    sections: [
      section('hero', { title: 'Shop the Collection', subtitle: '', layout: 'centered', height: 'sm' }),
      section('featured-products', { title: 'All Products', columns: 4, limit: 12, showViewAll: false }),
      section('newsletter', { title: 'Stay updated', subtitle: '' }),
    ],
  },
  {
    name: 'Editorial Luxe',
    category: 'Premium Lifestyle',
    description:
      'A magazine-style, art-directed layout for premium apparel, accessories and lifestyle brands — trust content and editorial breaks are woven between product sections instead of one long scroll of grids.',
    displayOrder: 9,
    colors: {
      primary: '#8B5E34',
      secondary: '#1A1A1A',
      accent: '#C9A227',
      background: '#FBF8F3',
      surface: '#FFFFFF',
      text: '#1A1614',
      mutedText: '#6B6157',
      border: '#E8E1D6',
    },
    typographyPreset: 'elegant',
    headerStyle: 'solid',
    sections: [
      // 1. Full-bleed editorial hero — the reference's core lesson: a
      // premium hero is a photograph with restrained type over it, not a
      // flat color block.
      section('hero', {
        badge: 'New Arrivals',
        title: 'Elevate Your Everyday Style',
        subtitle:
          'Discover premium quality pieces that combine elegance, comfort and craftsmanship.',
        primaryCtaLabel: 'Shop Now',
        layout: 'content-left',
        height: 'lg',
        backgroundType: 'image',
        imageUrl: 'https://picsum.photos/seed/editorial-luxe-hero/1800/1100',
        backgroundPosition: 'center',
        overlayType: 'dark',
        overlay: 35,
      }),
      // 2. Trust strip directly under the hero (no image) — matches the
      // reference's "Free Shipping / Easy Returns / Secure Payment / 24/7
      // Support" bar, using why-choose-us in its plain 4-card mode.
      section('why-choose-us', {
        title: 'Shop With Confidence',
        items: [
          { title: 'Free Shipping', description: 'On orders over 2,500 Tk' },
          { title: 'Easy Returns', description: '30-day return policy' },
          { title: 'Secure Payment', description: 'bKash & card, fully protected' },
          { title: '24/7 Support', description: 'Real people, real fast' },
        ],
      }),
      // 3. Category grid — automatically shows real product photography
      // per category once the store has products (see the storefront
      // categories API), falling back to a plain tile otherwise.
      section('featured-categories', { title: 'Shop by Category', subtitle: 'Browse the edit', limit: 6 }),
      // 4. Editorial promo break — a full photographic banner, not another
      // product grid, to break up the rhythm.
      section('promo-banner', {
        heading: 'The New Season Edit',
        description: 'Considered pieces for the way you actually live.',
        ctaLabel: 'Explore the edit',
        backgroundType: 'image',
        imageUrl: 'https://picsum.photos/seed/editorial-luxe-season/1400/700',
        backgroundPosition: 'center',
        overlayType: 'dark',
        overlay: 40,
      }),
      // 5. Product spotlight.
      section('best-sellers', { title: 'Handpicked Just For You', subtitle: 'Most loved this month', columns: 4, limit: 8 }),
      // 6. The signature new capability: an editorial split panel — a real
      // photo beside a checklist, instead of another 4-up card grid.
      section('why-choose-us', {
        title: 'The Difference Is In The Details',
        imageUrl: 'https://picsum.photos/seed/editorial-luxe-difference/900/1100',
        imagePosition: 'right',
        items: [
          { title: 'Premium materials', description: 'Sourced and inspected before they ever reach you' },
          { title: 'Considered pricing', description: 'No inflate-then-discount games' },
          { title: 'Fast, tracked delivery', description: 'Across Bangladesh, every order' },
          { title: 'Dedicated support', description: 'A real person, not a bot, when you need one' },
        ],
      }),
      // 7. Dark testimonial break — the reference's customer-quote panel.
      section('testimonials', {
        title: 'What Our Customers Say',
        backgroundType: 'gradient',
        overlayType: 'none',
      }),
      // 8. A second, differently-composed product section for rhythm.
      section('featured-products', { title: 'Fresh Arrivals', subtitle: 'Just landed', columns: 4, limit: 8, showViewAll: true }),
      // 9. Closing offer banner — lighter treatment than the mid-page
      // editorial break, for visual variety rather than repetition.
      section('promo-banner', {
        heading: 'Get 10% Off Your First Order',
        description: 'Use code WELCOME at checkout.',
        ctaLabel: 'Start shopping',
        backgroundType: 'color',
      }),
      section('newsletter', {
        title: 'Join the List',
        subtitle: 'Early access to new arrivals and private sales — no spam, ever.',
      }),
    ],
  },
  {
    // Source design: Figma Make export "ModernCommerce" — a near-black +
    // indigo, editorial-serif-heading premium storefront. Renders through
    // apps/storefront/src/themes/modern-commerce/ (templateId below) — a
    // purpose-built component tree matching the source's actual layout and
    // chrome, not the shared generic renderer with different tokens.
    name: 'Premium Modern',
    category: 'Premium Lifestyle',
    description:
      'A sharp, monochrome-plus-indigo premium layout with serif display headings, a real cart drawer, search overlay and mobile nav — for stores that want a true editorial storefront experience.',
    displayOrder: 10,
    templateId: 'modern-commerce',
    colors: {
      primary: '#111111',
      secondary: '#4338CA',
      accent: '#4338CA',
      background: '#F9FAFB',
      surface: '#FFFFFF',
      text: '#111111',
      mutedText: '#4B5563',
      border: '#E5E7EB',
    },
    // Closest system-safe match to the source's DM Serif Display / Inter
    // pairing: 'elegant' resolves to Georgia headings + Inter body (see
    // theme.ts#TYPOGRAPHY_PRESETS). DM Serif Display itself isn't used —
    // the storefront has no Google Fonts loading mechanism, so an unloaded
    // custom font name would silently fall back past 'system-ui' to a
    // plain sans-serif, losing the serif look entirely rather than
    // approximating it. Adding real Google Fonts support is a separate,
    // larger capability, not something to bolt on for one preset.
    typographyPreset: 'elegant',
    headerStyle: 'solid',
    sections: [
      // 1. Hero — full-bleed photo, restrained type, matches the source's
      // dark, editorial hero treatment.
      section('hero', {
        badge: 'New Season',
        title: 'Elevated Essentials',
        subtitle: 'Modern staples, considered details — shop the new arrivals.',
        primaryCtaLabel: 'Shop Collection',
        layout: 'content-left',
        height: 'lg',
        backgroundType: 'image',
        imageUrl: 'https://picsum.photos/seed/premium-modern-hero/1800/1100',
        backgroundPosition: 'center',
        overlayType: 'dark',
        overlay: 40,
      }),
      // 2. Benefits row (source: Benefits.tsx) → why-choose-us, plain
      // 4-card mode.
      section('why-choose-us', {
        title: 'Shop With Confidence',
        items: [
          { title: 'Free Delivery', description: 'On orders over 2,000 Tk' },
          { title: 'Easy Returns', description: '7-day hassle-free returns' },
          { title: 'Secure Checkout', description: 'bKash & Cash on Delivery' },
          { title: 'Quality Guaranteed', description: 'Every item inspected before dispatch' },
        ],
      }),
      // 3. Category grid (source: CategoryGrid.tsx).
      section('featured-categories', { title: 'Shop by Category', limit: 6 }),
      // 4. New Arrivals (source: NewArrivals.tsx) — a horizontally-scrolling
      // carousel, distinct in presentation from the Featured Products grid
      // below even though both currently read the same "newest" feed.
      section('featured-products', {
        title: 'New Arrivals',
        subtitle: 'Just landed',
        columns: 4,
        limit: 8,
        showViewAll: true,
        displayStyle: 'carousel',
      }),
      // 5. Promo banner (source: PromoBanner.tsx) — real countdown, backed
      // by the countdownEndsAt field the modern-commerce renderer reads.
      // A fixed 48h-from-publish target; Master Admin can edit or clear it
      // from the theme editor like any other section field.
      section('promo-banner', {
        heading: 'Season Sale — Up To 30% Off',
        description: 'Considered pieces, now more accessible.',
        ctaLabel: 'Shop the sale',
        backgroundType: 'image',
        imageUrl: 'https://picsum.photos/seed/premium-modern-promo/1400/700',
        backgroundPosition: 'center',
        overlayType: 'dark',
        overlay: 45,
        countdownEndsAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      }),
      // 6. Best sellers (source: BestSellers.tsx) — backed by real
      // sales-ranked data (storefront.service.ts#getBestSellingProducts),
      // genuinely distinct from the featured-products row above.
      section('best-sellers', {
        title: 'Best Sellers',
        subtitle: 'Most loved this month',
        columns: 4,
        limit: 8,
      }),
      // 7. Testimonials (source: Testimonials.tsx).
      section('testimonials', { title: 'What Our Customers Say' }),
      // 8. Newsletter (source: Newsletter.tsx).
      section('newsletter', {
        title: 'Stay In The Loop',
        subtitle: 'New arrivals and offers, straight to your inbox.',
      }),
    ],
  },
];
