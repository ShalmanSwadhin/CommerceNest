/**
 * Marketing homepage content — structured for future CMS / Master Admin control.
 * Replace values here (or later via API) without rewriting section components.
 */

export type HomeNavItem = {
  id: string;
  label: string;
  href: string;
  children?: { label: string; href: string; description?: string }[];
};

export type HomeFeature = {
  id: string;
  title: string;
  description: string;
  icon: 'layers' | 'wallet' | 'palette' | 'chart' | 'shield' | 'headset';
};

export type HomeCapabilityStat = {
  id: string;
  value: string;
  label: string;
  icon: 'store' | 'bkash' | 'tenant' | 'platform';
};

export type HomeTestimonial = {
  id: string;
  quote: string;
  name: string;
  business: string;
  avatarInitials: string;
  rating: number;
  /** Demo illustrative content — not claimed as live customer reviews. */
  isDemo: boolean;
};

export type HomeTrustItem = {
  id: string;
  label: string;
  detail: string;
};

export const homeContent = {
  brand: {
    name: 'CommerceNest',
    tagline: 'Build. Grow. Scale.',
    description:
      'The all-in-one e-commerce SaaS platform built for Bangladesh businesses.',
  },

  nav: [
    { id: 'features', label: 'Features', href: '#features' },
    { id: 'pricing', label: 'Pricing', href: '#pricing' },
    { id: 'themes', label: 'Themes', href: '#themes' },
    {
      id: 'resources',
      label: 'Resources',
      href: '#resources',
      children: [
        {
          label: 'Documentation',
          href: '#resources',
          description: 'Architecture, API, and deployment guides',
        },
        {
          label: 'Guides',
          href: '#features',
          description: 'How merchants run stores on CommerceNest',
        },
        {
          label: 'Help Center',
          href: '#contact',
          description: 'Get answers and contact the team',
        },
      ],
    },
    { id: 'about', label: 'About', href: '#about' },
    { id: 'contact', label: 'Contact', href: '#contact' },
  ] satisfies HomeNavItem[],

  hero: {
    badge: 'The All-in-One E-commerce SaaS for Bangladesh',
    headlineLead: 'Launch Your',
    headlineEmphasis: 'E-commerce Empire',
    headlineTrail: 'With CommerceNest',
    supporting:
      'Run unlimited stores, manage everything from one powerful platform, and grow your business without limits.',
    bullets: [
      'Multi-tenant SaaS Platform',
      'Manual bKash & COD Ready',
      'Themes, CMS & Custom Domains',
      'Powerful Admin & Analytics',
    ],
    primaryCta: { label: 'Start Your 14-Day Free Trial', href: '#contact' },
    secondaryCta: { label: 'Book a Demo', href: '#contact' },
    trustLine: 'Built for ambitious businesses across Bangladesh',
    floatingBadge: '100% Bangladesh Focused',
  },

  trustStrip: [
    {
      id: 'platform',
      title: 'One Platform',
      subtitle: 'Unlimited Stores',
      icon: 'layers' as const,
    },
    {
      id: 'secure',
      title: 'Secure & Reliable',
      subtitle: 'Built for Business',
      icon: 'shield' as const,
    },
    {
      id: 'scale',
      title: 'Fast & Scalable',
      subtitle: 'Ready to Grow',
      icon: 'zap' as const,
    },
    {
      id: 'local',
      title: 'Local Support',
      subtitle: 'Bangladesh Focused',
      icon: 'map' as const,
    },
    {
      id: 'easy',
      title: 'Easy to Use',
      subtitle: 'No Technical Skills Needed',
      icon: 'spark' as const,
    },
  ],

  features: {
    eyebrow: 'Everything you need',
    title: 'All-in-One E-commerce Platform for Modern Business',
    supporting:
      'From store management to payments, themes to analytics — CommerceNest has everything you need to grow your e-commerce business.',
    items: [
      {
        id: 'multi-tenant',
        title: 'Multi-tenant Architecture',
        description:
          'Manage multiple stores from one powerful platform with hard data isolation.',
        icon: 'layers',
      },
      {
        id: 'payments',
        title: 'Manual bKash & COD',
        description:
          'Built around Bangladesh-friendly payment workflows merchants already use.',
        icon: 'wallet',
      },
      {
        id: 'themes',
        title: 'Themes & Customization',
        description:
          'Beautiful storefronts with draft/publish themes and flexible CMS blocks.',
        icon: 'palette',
      },
      {
        id: 'analytics',
        title: 'Analytics & Reports',
        description:
          'Understand your business with actionable insights across stores and orders.',
        icon: 'chart',
      },
      {
        id: 'security',
        title: 'Security First',
        description:
          'Tenant isolation, authenticated admin access, and audit controls built in.',
        icon: 'shield',
      },
      {
        id: 'support',
        title: 'Merchant Support Tools',
        description:
          'Announcements, support tickets, and impersonation to help merchants faster.',
        icon: 'headset',
      },
    ] satisfies HomeFeature[],
  },

  bangladesh: {
    id: 'about',
    title: 'Built for Businesses in Bangladesh',
    supporting:
      'From local payment workflows to merchant-friendly tools, CommerceNest is designed around the way businesses in Bangladesh sell online.',
    highlights: [
      { id: 'currency', label: 'Local Currency', detail: '৳ BDT-ready commerce flows' },
      { id: 'bkash', label: 'bKash', detail: 'Manual payment workflow' },
      { id: 'cod', label: 'COD', detail: 'Cash on Delivery supported' },
      { id: 'focus', label: 'Bangladesh Focused', detail: 'Built for local merchants' },
    ],
  },

  /** Capability statements — never fabricate traction metrics. */
  stats: {
    title: 'A platform built to scale with you',
    supporting:
      'CommerceNest focuses on real product capabilities — not vanity numbers.',
    items: [
      {
        id: 'stores',
        value: 'Unlimited',
        label: 'Store Management',
        icon: 'store',
      },
      {
        id: 'bkash',
        value: 'Built-in',
        label: 'bKash Workflow',
        icon: 'bkash',
      },
      {
        id: 'tenant',
        value: 'Multi-tenant',
        label: 'Architecture',
        icon: 'tenant',
      },
      {
        id: 'platform',
        value: 'One',
        label: 'Powerful Platform',
        icon: 'platform',
      },
    ] satisfies HomeCapabilityStat[],
  },

  testimonials: {
    title: 'What Our Merchants Say',
    caption:
      'Illustrative merchant stories showing how CommerceNest is designed to work. Replace with live quotes when available.',
    items: [
      {
        id: 't1',
        quote:
          'Having Manual bKash and COD in one place matches how we already sell. The store admin finally feels built for Bangladesh, not forced into Western checkout.',
        name: 'Ahmad Hassan',
        business: 'TechWorld BD (demo persona)',
        avatarInitials: 'AH',
        rating: 5,
        isDemo: true,
      },
      {
        id: 't2',
        quote:
          'Managing products, payments, and customers from one dashboard saved us from juggling spreadsheets and chat screenshots for every order.',
        name: 'Rahima Akter',
        business: 'Rahim Mobile (demo persona)',
        avatarInitials: 'RA',
        rating: 5,
        isDemo: true,
      },
      {
        id: 't3',
        quote:
          'Themes and CMS let us look premium without hiring a full engineering team. We launch campaigns and update pages in minutes.',
        name: 'Nusrat Jahan',
        business: 'Urban Threads (demo persona)',
        avatarInitials: 'NJ',
        rating: 5,
        isDemo: true,
      },
    ] satisfies HomeTestimonial[],
  },

  security: {
    title: 'Trust & Security',
    items: [
      {
        id: 'secure',
        label: 'Secure Platform',
        detail: 'Hardened API with authenticated sessions',
      },
      {
        id: 'tenant',
        label: 'Tenant Isolation',
        detail: 'Store data scoped and enforced server-side',
      },
      {
        id: 'admin',
        label: 'Protected Admin Access',
        detail: 'Role-based access and audit logging',
      },
      {
        id: 'bkash',
        label: 'Manual bKash Workflow',
        detail: 'Txn submit → merchant verify',
      },
      {
        id: 'cod',
        label: 'COD Supported',
        detail: 'Cash on Delivery with confirmation flow',
      },
      {
        id: 'bd',
        label: 'Bangladesh Focused',
        detail: 'Local payments and merchant UX',
      },
    ] satisfies HomeTrustItem[],
  },

  pricingTeaser: {
    id: 'pricing',
    title: 'Simple plans for growing merchants',
    supporting:
      'Start with a free trial conversation. Pricing packages will be published as CommerceNest goes live for onboarding.',
    cta: { label: 'Talk to us about pricing', href: '#contact' },
  },

  themesTeaser: {
    id: 'themes',
    title: 'Themes that look ready for launch',
    supporting:
      'Draft, publish, and roll back storefront themes from Master Admin — merchants get polished shops without custom engineering.',
  },

  finalCta: {
    title: 'Ready to Grow Your E-commerce Business?',
    supporting: 'Start building your online business with CommerceNest.',
    primary: { label: 'Start Free Trial', href: '#contact' },
    secondary: { label: 'Schedule a Demo', href: '#contact' },
  },

  contact: {
    title: 'Contact CommerceNest',
    supporting:
      'Tell us about your stores and goals. We will follow up about demos and early access.',
    success:
      'Thanks — your message is ready to send. If email is configured, we will open your mail client.',
  },

  footer: {
    columns: [
      {
        title: 'Platform',
        links: [
          { label: 'Features', href: '#features' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'Themes', href: '#themes' },
          { label: 'Security', href: '#security' },
          { label: 'API Documentation', href: '#resources' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'Documentation', href: '#resources' },
          { label: 'Guides', href: '#features' },
          { label: 'Blog', href: '#resources' },
          { label: 'Help Center', href: '#contact' },
          { label: 'Community', href: '#contact' },
        ],
      },
      {
        title: 'Company',
        links: [
          { label: 'About Us', href: '#about' },
          { label: 'Contact Us', href: '#contact' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Refund Policy', href: '/refund' },
        ],
      },
    ],
    /** Only render when env provides a real address */
    supportBlurb: 'Based in Bangladesh · Built for local merchants',
    copyright: `© ${new Date().getFullYear()} CommerceNest. All rights reserved.`,
  },

  /** Sample UI values for marketing device mockups only — not live platform metrics. */
  dashboardPreview: {
    title: 'Master Dashboard',
    kpis: [
      { label: 'Total Stores', value: '128', delta: '+12%' },
      { label: 'Active Stores', value: '98', delta: '+8%' },
      { label: 'Platform Revenue', value: '৳4.2L', delta: '+18%' },
      { label: 'Total Orders', value: '3,841', delta: '+22%' },
    ],
    recentStores: [
      { name: 'TechWorld BD', status: 'Active', orders: 412 },
      { name: 'Rahim Mobile', status: 'Active', orders: 287 },
      { name: 'Urban Threads', status: 'Active', orders: 198 },
    ],
    activity: [
      'Payment approved · TechWorld BD',
      'New store provisioned · Urban Threads',
      'Theme published · Rahim Mobile',
    ],
  },

  mobilePreview: {
    storeName: 'TechWorld BD',
    banner: 'Summer Sale 50% OFF',
    products: [
      { name: 'Galaxy Buds Pro', price: '৳8,999' },
      { name: 'Smart Watch X', price: '৳4,499' },
      { name: 'USB-C Hub Pro', price: '৳1,299' },
      { name: 'Power Bank 20K', price: '৳1,899' },
    ],
  },
} as const;

export type HomeContent = typeof homeContent;
