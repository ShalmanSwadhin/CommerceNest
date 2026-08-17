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
    { id: 'themes', label: 'Themes', href: '#themes' },
    { id: 'pricing', label: 'Pricing', href: '#pricing' },
    { id: 'how-it-works', label: 'How It Works', href: '#how-it-works' },
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
    primaryCta: { label: 'Start Your Free Trial', href: '/trial' },
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

  howItWorks: {
    id: 'how-it-works',
    eyebrow: 'How it works',
    title: 'From signup to your first order',
    supporting:
      'CommerceNest handles the setup work so you can focus on your products.',
    steps: [
      {
        id: 'start',
        title: 'Start your free trial',
        description:
          'Tell us about your business and we provision a real, working storefront instantly — no waiting.',
      },
      {
        id: 'storefront',
        title: 'CommerceNest prepares your storefront',
        description:
          'Your trial store launches with a ready-made theme and layout, live at your own subdomain.',
      },
      {
        id: 'products',
        title: 'Add your products',
        description:
          'Add products, categories, and images from the Store Admin dashboard.',
      },
      {
        id: 'configure',
        title: 'Configure your business',
        description:
          'Set your bKash number, shipping rates, and delivery areas so checkout works the way your business does.',
      },
      {
        id: 'package',
        title: 'Choose a package',
        description:
          'When you are ready to go live, pick the Starter, Business, or Pro plan that fits your store.',
      },
      {
        id: 'publish',
        title: 'Publish',
        description:
          'Your storefront design is reviewed and published by the CommerceNest team, then goes live for customers.',
      },
      {
        id: 'orders',
        title: 'Receive and manage orders',
        description:
          'Take orders via Cash on Delivery or manual bKash, and manage everything from your dashboard.',
      },
    ],
  },

  faq: {
    id: 'faq',
    eyebrow: 'Questions',
    title: 'Frequently asked questions',
    items: [
      {
        id: 'trial-length',
        question: 'How long is the free trial?',
        answer:
          'The default trial period is 7 days, configurable by the CommerceNest team. Your trial storefront stays live and your data is preserved even after the trial period — nothing is deleted automatically.',
      },
      {
        id: 'payment-methods',
        question: 'What payment methods are supported?',
        answer:
          'Cash on Delivery (COD) and manual bKash are supported today, matching how most Bangladeshi merchants already sell.',
      },
      {
        id: 'theme-customization',
        question: 'Can I customize my storefront design?',
        answer:
          'You can choose from ready-made storefront layouts, and CommerceNest manages publishing and updates for you. Fully custom design work is available as an additional service — the Pro plan includes it.',
      },
      {
        id: 'multiple-stores',
        question: 'Can I run more than one store?',
        answer:
          'Yes — CommerceNest is built as a multi-tenant platform, so a single business can operate multiple isolated storefronts.',
      },
      {
        id: 'pricing-change',
        question: 'Can I change plans later?',
        answer:
          'Yes. Contact the CommerceNest team to move between Starter, Business, and Pro as your store grows.',
      },
    ],
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
      'Low monthly pricing with a small platform fee that scales with your business. Payment gateway charges (bKash, etc.) are separate.',
    cta: { label: 'See full pricing', href: '/pricing' },
  },

  themesTeaser: {
    id: 'themes',
    title: 'Storefront themes, managed for you',
    supporting:
      'Choose from ready-made storefront layouts and let CommerceNest publish and manage your theme — a fast, professional storefront without hiring a developer. Want something custom? Request theme customization as an add-on service.',
  },

  finalCta: {
    title: 'Ready to Grow Your E-commerce Business?',
    supporting: 'Start building your online business with CommerceNest.',
    primary: { label: 'Start Free Trial', href: '/trial' },
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
          { label: 'Themes', href: '#themes' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'Security', href: '#security' },
          { label: 'Start Free Trial', href: '/trial' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'How It Works', href: '#how-it-works' },
          { label: 'FAQ', href: '#faq' },
          { label: 'Help Center', href: '#contact' },
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
