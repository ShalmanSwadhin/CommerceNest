import { z } from 'zod';

/** Homepage section types the storefront can render. */
export const themeSectionTypeSchema = z.enum([
  'hero',
  'featured-categories',
  'featured-products',
  'promo-banner',
  'best-sellers',
  'why-choose-us',
  'testimonials',
  'newsletter',
]);

export type ThemeSectionType = z.infer<typeof themeSectionTypeSchema>;

export const themeSectionSchema = z.object({
  id: z.string().min(1),
  type: themeSectionTypeSchema,
  visible: z.boolean().default(true),
  settings: z.record(z.unknown()).default({}),
});

export type ThemeSection = z.infer<typeof themeSectionSchema>;

export const themeLayoutSchema = z.object({
  sections: z.array(themeSectionSchema).default([]),
});

export type ThemeLayout = z.infer<typeof themeLayoutSchema>;

export const themeColorsSchema = z.object({
  primary: z.string().default('#6C1DB3'),
  secondary: z.string().default('#F59E0B'),
  accent: z.string().default('#8B5CF6'),
  background: z.string().default('#F7F8FB'),
  surface: z.string().default('#FFFFFF'),
  text: z.string().default('#111827'),
  mutedText: z.string().default('#6B7280'),
  border: z.string().default('#E5E7EB'),
  success: z.string().default('#16A34A'),
  warning: z.string().default('#F59E0B'),
  error: z.string().default('#EF4444'),
});

export const themeTypographySchema = z.object({
  headingFont: z.string().default('Inter'),
  bodyFont: z.string().default('Inter'),
  baseFontSize: z.number().default(16),
  headingWeight: z.number().default(700),
  bodyWeight: z.number().default(400),
  preset: z
    .enum(['modern', 'elegant', 'minimal', 'bold', 'classic'])
    .default('modern'),
});

export const themeHeaderSchema = z.object({
  style: z.enum(['solid', 'minimal', 'centered']).default('solid'),
  sticky: z.boolean().default(true),
  showSearch: z.boolean().default(true),
  showCart: z.boolean().default(true),
  showAccount: z.boolean().default(true),
  logoSize: z.enum(['sm', 'md', 'lg']).default('md'),
});

export const themeFooterSchema = z.object({
  description: z.string().default(''),
  copyrightText: z.string().default(''),
  /** Platform attribution — Store Admin cannot disable; Master Admin may leave true. */
  showPoweredBy: z.boolean().default(true),
  columns: z
    .array(
      z.object({
        title: z.string(),
        links: z.array(
          z.object({
            label: z.string(),
            href: z.string(),
          }),
        ),
      }),
    )
    .default([]),
});

export const themeProductCardSchema = z.object({
  style: z.enum(['classic', 'modern', 'minimal', 'elevated']).default('modern'),
  showPrice: z.boolean().default(true),
  showDiscount: z.boolean().default(true),
  imageRatio: z.enum(['1/1', '4/3', '3/4']).default('1/1'),
  radius: z.string().default('12'),
});

export const themeButtonsSchema = z.object({
  radius: z.string().default('10'),
  primaryShadow: z.boolean().default(true),
});

export const themeBrandingSchema = z.object({
  logoUrl: z.string().default(''),
  faviconUrl: z.string().default(''),
  announcement: z.string().default(''),
  tagline: z.string().default(''),
});

export const themeSettingsSchema = z.object({
  branding: themeBrandingSchema.default({}),
  colors: themeColorsSchema.default({}),
  typography: themeTypographySchema.default({}),
  header: themeHeaderSchema.default({}),
  footer: themeFooterSchema.default({}),
  productCard: themeProductCardSchema.default({}),
  buttons: themeButtonsSchema.default({}),
  cornerRadius: z.union([z.string(), z.number()]).default('12'),
  // Legacy flat keys kept for older drafts (mirrored by normalize)
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  heroTitle: z.string().optional(),
  heroSubtitle: z.string().optional(),
  heroImageUrl: z.string().optional(),
  announcement: z.string().optional(),
  headerStyle: z.string().optional(),
  footerText: z.string().optional(),
  borderRadius: z.union([z.string(), z.number()]).optional(),
});

export type ThemeSettingsV2 = z.infer<typeof themeSettingsSchema>;

export const themeDocumentSchema = z.object({
  layout: themeLayoutSchema,
  themeSettings: themeSettingsSchema,
});

export type ThemeDocument = z.infer<typeof themeDocumentSchema>;

export const DEFAULT_SECTION_DEFS: {
  type: ThemeSectionType;
  label: string;
  defaultSettings: Record<string, unknown>;
}[] = [
  {
    type: 'hero',
    label: 'Hero',
    defaultSettings: {
      layout: 'content-left',
      badge: '',
      title: '',
      subtitle: '',
      primaryCtaLabel: 'Shop Now',
      primaryCtaHref: '/c/all',
      secondaryCtaLabel: '',
      secondaryCtaHref: '',
      imageUrl: '',
      backgroundType: 'gradient',
      backgroundPosition: 'center',
      overlayType: 'none',
      overlayColor: '#0B1023',
      overlay: 45,
      textAlign: 'left',
      height: 'lg',
    },
  },
  {
    type: 'featured-categories',
    label: 'Featured Categories',
    defaultSettings: {
      title: 'Shop by Category',
      subtitle: '',
      layout: 'cards',
      limit: 6,
    },
  },
  {
    type: 'featured-products',
    label: 'Featured Products',
    defaultSettings: {
      title: 'Featured Products',
      subtitle: 'Hand-picked for you',
      limit: 8,
      columns: 4,
      showViewAll: true,
      source: 'latest',
    },
  },
  {
    type: 'promo-banner',
    label: 'Promotional Banner',
    defaultSettings: {
      heading: 'Limited time offer',
      description: 'Save on your favourite picks this week.',
      ctaLabel: 'Shop deals',
      ctaHref: '/c/all',
      imageUrl: '',
      backgroundType: 'gradient',
      backgroundPosition: 'center',
      overlayType: 'none',
      overlayColor: '#0B1023',
      overlay: 40,
    },
  },
  {
    type: 'best-sellers',
    label: 'Best Sellers',
    defaultSettings: {
      title: 'Best Sellers',
      subtitle: 'What customers love',
      limit: 8,
      columns: 4,
      showViewAll: true,
      source: 'latest',
    },
  },
  {
    type: 'why-choose-us',
    label: 'Why Choose Us',
    defaultSettings: {
      title: 'Why shop with us',
      imageUrl: '',
      imagePosition: 'right',
      items: [
        { title: 'Authentic Products', description: 'Sourced from trusted suppliers' },
        { title: 'Fast Delivery', description: 'Nationwide shipping across Bangladesh' },
        { title: 'Easy Returns', description: 'Hassle-free return support' },
        { title: 'Secure Checkout', description: 'Manual bKash & COD supported' },
      ],
    },
  },
  {
    type: 'testimonials',
    label: 'Testimonials',
    defaultSettings: {
      title: 'What customers say',
      caption: 'Illustrative sample quotes for preview',
      imageUrl: '',
      backgroundType: 'none',
      backgroundPosition: 'center',
      overlayType: 'none',
      overlayColor: '#0B1023',
      overlay: 60,
      items: [
        {
          quote: 'Smooth checkout with bKash and great product quality.',
          name: 'Demo Customer',
          business: 'Dhaka',
          rating: 5,
          avatarUrl: '',
        },
      ],
    },
  },
  {
    type: 'newsletter',
    label: 'Newsletter',
    defaultSettings: {
      title: 'Stay in the loop',
      subtitle: 'Get offers and new arrivals in your inbox.',
      buttonText: 'Subscribe',
    },
  },
];

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultSections(): ThemeSection[] {
  return DEFAULT_SECTION_DEFS.map((def) => ({
    id: newId(def.type),
    type: def.type,
    visible: true,
    settings: { ...def.defaultSettings },
  }));
}

export type ResolvedSectionBackground = {
  /**
   * `'none'` is distinct from `'color'`: it means "no background layer at
   * all — let the page's own background show through," which is what
   * sections that predate this system (e.g. testimonials) always looked
   * like. `'color'` is a real, visible solid-fill choice (the theme's
   * primary color). Collapsing the two would either misrepresent
   * `'color'` as a no-op or silently reskin every pre-existing section the
   * first time this system reached it.
   */
  backgroundType: 'none' | 'color' | 'gradient' | 'image';
  image: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  overlayType: 'none' | 'dark' | 'light' | 'custom';
  overlayColor: string;
  overlayOpacity: number;
};

const BACKGROUND_TYPES = ['none', 'color', 'gradient', 'image'] as const;
const BACKGROUND_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const;
const OVERLAY_TYPES = ['none', 'dark', 'light', 'custom'] as const;

function numberOrDefault(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Resolves a section's background settings into a fully-defaulted shape —
 * shared by the Theme Builder preview, the SectionInspector editor, and the
 * real storefront so all three agree on exactly what should render.
 *
 * Backward compatible by construction: a section saved before `backgroundType`
 * existed only ever had `imageUrl` (+ a numeric `overlay`, always applied
 * whenever an image was set). Inferring `backgroundType`/`overlayType` from
 * `imageUrl` when they're absent reproduces that exact old visual result, so
 * no migration or explicit backfill is needed for existing themes.
 */
export function resolveSectionBackground(
  settings: Record<string, unknown>,
): ResolvedSectionBackground {
  const image = String(settings.imageUrl ?? '');

  const rawType = settings.backgroundType;
  const backgroundType = (BACKGROUND_TYPES as readonly string[]).includes(rawType as string)
    ? (rawType as ResolvedSectionBackground['backgroundType'])
    : image
      ? 'image'
      : 'gradient';

  const rawPosition = settings.backgroundPosition;
  const position = (BACKGROUND_POSITIONS as readonly string[]).includes(rawPosition as string)
    ? (rawPosition as ResolvedSectionBackground['position'])
    : 'center';

  const rawOverlayType = settings.overlayType;
  const overlayType = (OVERLAY_TYPES as readonly string[]).includes(rawOverlayType as string)
    ? (rawOverlayType as ResolvedSectionBackground['overlayType'])
    : backgroundType === 'image'
      ? 'dark'
      : 'none';

  const overlayColor = String(settings.overlayColor || '#0B1023');
  const overlayOpacity = numberOrDefault(settings.overlay, 45);

  return { backgroundType, image, position, overlayType, overlayColor, overlayOpacity };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Merge legacy flat themeSettings + layout into the v2 document shape. */
export function normalizeThemeDocument(input: {
  layout?: unknown;
  themeSettings?: unknown;
}): ThemeDocument {
  const rawSettings = asRecord(input.themeSettings) || {};
  const nestedColors = asRecord(rawSettings.colors);
  const nestedBrand = asRecord(rawSettings.branding);
  const nestedType = asRecord(rawSettings.typography);
  const nestedHeader = asRecord(rawSettings.header);
  const nestedFooter = asRecord(rawSettings.footer);

  const primary =
    (nestedColors?.primary as string) ||
    (rawSettings.primaryColor as string) ||
    '#6C1DB3';
  const secondary =
    (nestedColors?.secondary as string) ||
    (rawSettings.secondaryColor as string) ||
    (rawSettings.accentColor as string) ||
    '#F59E0B';
  const font =
    (nestedType?.bodyFont as string) ||
    (rawSettings.fontFamily as string) ||
    'Inter';

  const themeSettings = themeSettingsSchema.parse({
    ...rawSettings,
    branding: {
      logoUrl: nestedBrand?.logoUrl ?? rawSettings.logoUrl ?? '',
      faviconUrl: nestedBrand?.faviconUrl ?? rawSettings.faviconUrl ?? '',
      announcement: nestedBrand?.announcement ?? rawSettings.announcement ?? '',
      tagline: nestedBrand?.tagline ?? '',
    },
    colors: {
      primary,
      secondary,
      accent: (nestedColors?.accent as string) || secondary,
      background: (nestedColors?.background as string) || '#F7F8FB',
      surface: (nestedColors?.surface as string) || '#FFFFFF',
      text: (nestedColors?.text as string) || '#111827',
      mutedText: (nestedColors?.mutedText as string) || '#6B7280',
      border: (nestedColors?.border as string) || '#E5E7EB',
      success: (nestedColors?.success as string) || '#16A34A',
      warning: (nestedColors?.warning as string) || '#F59E0B',
      error: (nestedColors?.error as string) || '#EF4444',
    },
    typography: {
      headingFont: (nestedType?.headingFont as string) || font,
      bodyFont: font,
      baseFontSize: Number(nestedType?.baseFontSize ?? 16),
      headingWeight: Number(nestedType?.headingWeight ?? 700),
      bodyWeight: Number(nestedType?.bodyWeight ?? 400),
      preset: (
        ['modern', 'elegant', 'minimal', 'bold', 'classic'] as const
      ).includes(nestedType?.preset as 'modern')
        ? (nestedType?.preset as
            | 'modern'
            | 'elegant'
            | 'minimal'
            | 'bold'
            | 'classic')
        : 'modern',
    },
    header: {
      style: (['solid', 'minimal', 'centered'] as const).includes(
        (nestedHeader?.style || rawSettings.headerStyle) as
          | 'solid'
          | 'minimal'
          | 'centered',
      )
        ? ((nestedHeader?.style || rawSettings.headerStyle) as
            | 'solid'
            | 'minimal'
            | 'centered')
        : 'solid',
      sticky: nestedHeader?.sticky !== false,
      showSearch: nestedHeader?.showSearch !== false,
      showCart: nestedHeader?.showCart !== false,
      showAccount: nestedHeader?.showAccount !== false,
      logoSize: (['sm', 'md', 'lg'] as const).includes(
        nestedHeader?.logoSize as 'sm' | 'md' | 'lg',
      )
        ? (nestedHeader?.logoSize as 'sm' | 'md' | 'lg')
        : 'md',
    },
    footer: {
      description:
        (nestedFooter?.description as string) ||
        (rawSettings.footerText as string) ||
        '',
      copyrightText: (nestedFooter?.copyrightText as string) || '',
      /** Always true — platform attribution is protected for all tenants. */
      showPoweredBy: true,
      columns: Array.isArray(nestedFooter?.columns)
        ? nestedFooter.columns
        : [],
    },
    productCard: asRecord(rawSettings.productCard) || {},
    buttons: asRecord(rawSettings.buttons) || {},
    cornerRadius:
      rawSettings.cornerRadius ?? rawSettings.borderRadius ?? '12',
    // Keep legacy mirrors for older storefront readers
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: secondary,
    fontFamily: font,
    logoUrl: String(nestedBrand?.logoUrl ?? rawSettings.logoUrl ?? ''),
    faviconUrl: String(nestedBrand?.faviconUrl ?? rawSettings.faviconUrl ?? ''),
    announcement: String(
      nestedBrand?.announcement ?? rawSettings.announcement ?? '',
    ),
    headerStyle: String(
      nestedHeader?.style ?? rawSettings.headerStyle ?? 'solid',
    ),
    footerText: String(
      nestedFooter?.description ?? rawSettings.footerText ?? '',
    ),
    heroTitle: String(rawSettings.heroTitle ?? ''),
    heroSubtitle: String(rawSettings.heroSubtitle ?? ''),
    heroImageUrl: String(rawSettings.heroImageUrl ?? ''),
  });

  const rawLayout = asRecord(input.layout);
  const rawSections = Array.isArray(rawLayout?.sections)
    ? rawLayout.sections
    : [];

  let sections: ThemeSection[] = [];
  if (rawSections.length === 0) {
    sections = createDefaultSections();
    // Seed hero from legacy themeSettings
    const hero = sections.find((s) => s.type === 'hero');
    if (hero) {
      hero.settings = {
        ...hero.settings,
        title: themeSettings.heroTitle || '',
        subtitle: themeSettings.heroSubtitle || '',
        imageUrl: themeSettings.heroImageUrl || '',
      };
    }
  } else {
    sections = rawSections.map((item, index) => {
      const row = asRecord(item) || {};
      const typeRaw = String(row.type || 'featured-products');
      const type = themeSectionTypeSchema.safeParse(typeRaw).success
        ? (typeRaw as ThemeSectionType)
        : 'featured-products';
      const def = DEFAULT_SECTION_DEFS.find((d) => d.type === type);
      const settings = {
        ...(def?.defaultSettings || {}),
        ...(asRecord(row.settings) || {}),
      };
      // Legacy hero section: title/subtitle at top level
      if (type === 'hero') {
        if (row.title && !settings.title) settings.title = row.title;
        if (row.subtitle && !settings.subtitle) settings.subtitle = row.subtitle;
        if (!settings.imageUrl && themeSettings.heroImageUrl) {
          settings.imageUrl = themeSettings.heroImageUrl;
        }
        if (!settings.title && themeSettings.heroTitle) {
          settings.title = themeSettings.heroTitle;
        }
        if (!settings.subtitle && themeSettings.heroSubtitle) {
          settings.subtitle = themeSettings.heroSubtitle;
        }
      }
      if (type === 'featured-products' && row.limit != null) {
        settings.limit = row.limit;
      }
      return {
        id: typeof row.id === 'string' ? row.id : newId(type),
        type,
        visible: row.visible !== false,
        settings,
      };
    });
  }

  // Mirror hero section into legacy flat keys for StoreShell/old readers
  const heroSection = sections.find((s) => s.type === 'hero' && s.visible);
  if (heroSection) {
    themeSettings.heroTitle = String(heroSection.settings.title || '');
    themeSettings.heroSubtitle = String(heroSection.settings.subtitle || '');
    themeSettings.heroImageUrl = String(heroSection.settings.imageUrl || '');
  }

  return {
    layout: { sections },
    themeSettings,
  };
}

export const TYPOGRAPHY_PRESETS: Record<
  string,
  Partial<z.infer<typeof themeTypographySchema>>
> = {
  modern: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
    headingWeight: 700,
    bodyWeight: 400,
    preset: 'modern',
  },
  elegant: {
    headingFont: 'Georgia',
    bodyFont: 'Inter',
    headingWeight: 600,
    bodyWeight: 400,
    preset: 'elegant',
  },
  minimal: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
    headingWeight: 600,
    bodyWeight: 400,
    preset: 'minimal',
  },
  bold: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
    headingWeight: 800,
    bodyWeight: 500,
    preset: 'bold',
  },
  classic: {
    headingFont: 'Times New Roman',
    bodyFont: 'Georgia',
    headingWeight: 700,
    bodyWeight: 400,
    preset: 'classic',
  },
};

export const COLOR_PRESETS: Record<
  string,
  Partial<z.infer<typeof themeColorsSchema>>
> = {
  commercenest: {
    primary: '#6C1DB3',
    secondary: '#F59E0B',
    accent: '#8B5CF6',
  },
  tech: {
    primary: '#0F766E',
    secondary: '#F59E0B',
    accent: '#14B8A6',
  },
  fashion: {
    primary: '#BE185D',
    secondary: '#111827',
    accent: '#F472B6',
  },
  minimal: {
    primary: '#111827',
    secondary: '#6B7280',
    accent: '#374151',
  },
};
