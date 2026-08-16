/**
 * CommerceNest demo seed
 * - Master Admin
 * - 3 demo stores: TechWorld BD, Rahim Mobile, Urban Threads
 * - Products, customers, sample orders including pending bKash verification
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(repoRoot, '.env') });
config();

import {
  CustomThemeAvailability,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  StoreStatus,
  UserRole,
  UserStatus,
} from '@commercenest/types';
import { normalizeThemeDocument } from '@commercenest/types/schemas/theme';
import { prisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';
import { env } from './lib/env.js';
import { THEME_PRESETS } from './seed-data/theme-presets.js';

async function upsertStoreBundle(opts: {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  category: string;
  tagline: string;
  bkashNumber: string;
  products: Array<{
    name: string;
    slug: string;
    basePrice: number;
    sku: string;
    stock: number;
  }>;
}) {
  const passwordHash = await hashPassword('Owner123!');

  let owner = await prisma.user.findUnique({ where: { email: opts.ownerEmail } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        email: opts.ownerEmail,
        name: opts.ownerName,
        phone: opts.ownerPhone,
        passwordHash,
        role: UserRole.STORE_OWNER,
        status: UserStatus.ACTIVE,
      },
    });
  }

  let store = await prisma.store.findUnique({ where: { slug: opts.slug } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: opts.name,
        slug: opts.slug,
        status: StoreStatus.ACTIVE,
        ownerUserId: owner.id,
        category: opts.category,
        tagline: opts.tagline,
        planTier: 'growth',
        bkashNumber: opts.bkashNumber,
        bkashInstructions:
          'Send payment to the store bKash number and submit Txn ID at checkout.',
      },
    });
  }

  await prisma.user.update({
    where: { id: owner.id },
    data: { storeId: store.id },
  });

  let storefront = await prisma.storefront.findUnique({
    where: { storeId: store.id },
  });
  if (!storefront) {
    storefront = await prisma.storefront.create({ data: { storeId: store.id } });
    const draft = await prisma.storefrontVersion.create({
      data: {
        storefrontId: storefront.id,
        storeId: store.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        layout: {
          sections: [
            { type: 'hero', title: opts.name, subtitle: opts.tagline },
            { type: 'featured-products', limit: 8 },
          ],
        },
        themeSettings: {
          primaryColor: '#0F766E',
          accentColor: '#F59E0B',
          fontFamily: 'DM Sans',
        },
        publishedAt: new Date(),
        createdById: owner.id,
      },
    });
    await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        draftVersionId: draft.id,
        publishedVersionId: draft.id,
      },
    });
  }

  const hostname = `${opts.slug}.${env.PLATFORM_DOMAIN}`;
  await prisma.storeDomain.upsert({
    where: { hostname },
    create: {
      storeId: store.id,
      hostname,
      type: 'SUBDOMAIN',
      isPrimary: true,
      status: 'VERIFIED',
      sslStatus: 'ACTIVE',
    },
    update: {},
  });

  const category = await prisma.category.upsert({
    where: { storeId_slug: { storeId: store.id, slug: 'general' } },
    create: {
      storeId: store.id,
      name: 'General',
      slug: 'general',
    },
    update: {},
  });

  const createdProducts = [];
  for (const p of opts.products) {
    const product = await prisma.product.upsert({
      where: { storeId_slug: { storeId: store.id, slug: p.slug } },
      create: {
        storeId: store.id,
        categoryId: category.id,
        name: p.name,
        slug: p.slug,
        description: `${p.name} — demo product for ${opts.name}`,
        basePrice: p.basePrice,
        status: ProductStatus.ACTIVE,
        images: [],
        variants: {
          create: {
            storeId: store.id,
            sku: p.sku,
            stock: p.stock,
          },
        },
      },
      update: {
        basePrice: p.basePrice,
        status: ProductStatus.ACTIVE,
      },
      include: { variants: true },
    });
    createdProducts.push(product);
  }

  return { store, owner, products: createdProducts };
}

async function ensureCustomer(
  storeId: string,
  phone: string,
  name: string,
  risk?: { totalOrders: number; deliveredOrders: number; refusedOrders: number; riskLevel: 'NONE' | 'CAUTION' | 'HIGH_RISK' },
) {
  return prisma.customer.upsert({
    where: { storeId_phone: { storeId, phone } },
    create: {
      storeId,
      phone,
      name,
      totalOrders: risk?.totalOrders ?? 0,
      deliveredOrders: risk?.deliveredOrders ?? 0,
      refusedOrders: risk?.refusedOrders ?? 0,
      riskLevel: risk?.riskLevel ?? 'NONE',
    },
    update: {
      name,
      ...(risk
        ? {
            totalOrders: risk.totalOrders,
            deliveredOrders: risk.deliveredOrders,
            refusedOrders: risk.refusedOrders,
            riskLevel: risk.riskLevel,
          }
        : {}),
    },
  });
}

async function main() {
  // This script creates demo stores/products/orders and, by default, a
  // Master Admin with a well-known password (Admin123!). Running it against
  // a real production database is exactly the kind of "dev convenience
  // value used in production" that must be impossible by accident.
  if (env.NODE_ENV === 'production') {
    if (process.env.ALLOW_PROD_SEED !== 'true') {
      console.error(
        '[seed] Refusing to run: NODE_ENV=production. This script creates demo stores/orders and ' +
          'defaults to a well-known admin password (Admin123!) — it must never touch a real database. ' +
          'If you genuinely need to bootstrap the first Master Admin in production, set ' +
          'ALLOW_PROD_SEED=true and a strong SEED_ADMIN_PASSWORD, and be aware the demo stores/' +
          'products/orders will still be created alongside it.',
      );
      process.exit(1);
    }
    const prodPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!prodPassword || prodPassword === 'Admin123!') {
      console.error(
        '[seed] ALLOW_PROD_SEED=true requires SEED_ADMIN_PASSWORD to be set to a strong, ' +
          'non-default value (not "Admin123!").',
      );
      process.exit(1);
    }
  }

  console.log('Seeding CommerceNest…');

  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ??
    env.SEED_ADMIN_EMAIL ??
    'admin@commercenest.com';
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ??
    env.SEED_ADMIN_PASSWORD ??
    'Admin123!';
  const adminName =
    process.env.SEED_ADMIN_NAME ??
    env.SEED_ADMIN_NAME ??
    'CommerceNest Master Admin';

  const adminHash = await hashPassword(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      phone: '01700000001',
      passwordHash: adminHash,
      role: UserRole.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    update: {
      name: adminName,
      passwordHash: adminHash,
      status: UserStatus.ACTIVE,
      role: UserRole.MASTER_ADMIN,
    },
  });

  const tech = await upsertStoreBundle({
    name: 'TechWorld BD',
    slug: 'techworld-bd',
    ownerEmail: 'owner@techworld.bd',
    ownerName: 'Karim Tech',
    ownerPhone: '01711111111',
    category: 'Electronics',
    tagline: 'Gadgets for every budget',
    bkashNumber: '01711111111',
    products: [
      {
        name: 'Wireless Earbuds Pro',
        slug: 'wireless-earbuds-pro',
        basePrice: 2499,
        sku: 'TW-EAR-001',
        stock: 40,
      },
      {
        name: 'USB-C Fast Charger 65W',
        slug: 'usbc-charger-65w',
        basePrice: 1299,
        sku: 'TW-CHG-065',
        stock: 80,
      },
      {
        name: 'Bluetooth Speaker Mini',
        slug: 'bt-speaker-mini',
        basePrice: 1899,
        sku: 'TW-SPK-001',
        stock: 25,
      },
    ],
  });

  const rahim = await upsertStoreBundle({
    name: 'Rahim Mobile',
    slug: 'rahim-mobile',
    ownerEmail: 'owner@rahimmobile.bd',
    ownerName: 'Rahim Uddin',
    ownerPhone: '01822222222',
    category: 'Mobiles',
    tagline: 'Trusted phones & accessories',
    bkashNumber: '01822222222',
    products: [
      {
        name: 'Tempered Glass Pack',
        slug: 'tempered-glass-pack',
        basePrice: 199,
        sku: 'RM-GLS-001',
        stock: 200,
      },
      {
        name: 'Power Bank 20000mAh',
        slug: 'powerbank-20000',
        basePrice: 2199,
        sku: 'RM-PB-20K',
        stock: 35,
      },
    ],
  });

  const urban = await upsertStoreBundle({
    name: 'Urban Threads',
    slug: 'urban-threads',
    ownerEmail: 'owner@urbanthreads.bd',
    ownerName: 'Nusrat Fashion',
    ownerPhone: '01933333333',
    category: 'Fashion',
    tagline: 'Everyday essentials, elevated',
    bkashNumber: '01933333333',
    products: [
      {
        name: 'Classic Cotton Tee',
        slug: 'classic-cotton-tee',
        basePrice: 799,
        sku: 'UT-TEE-001',
        stock: 60,
      },
      {
        name: 'Linen Shirt',
        slug: 'linen-shirt',
        basePrice: 1599,
        sku: 'UT-SHIRT-01',
        stock: 30,
      },
    ],
  });

  // Customers with risk levels for TechWorld
  const goodCustomer = await ensureCustomer(
    tech.store.id,
    '01755555555',
    'Ayesha Rahman',
  );
  const cautionCustomer = await ensureCustomer(
    tech.store.id,
    '01766666666',
    'Imran Hossain',
    {
      totalOrders: 5,
      deliveredOrders: 3,
      refusedOrders: 2,
      riskLevel: 'CAUTION',
    },
  );
  const highRiskCustomer = await ensureCustomer(
    tech.store.id,
    '01777777777',
    'Risky Buyer',
    {
      totalOrders: 5,
      deliveredOrders: 1,
      refusedOrders: 4,
      riskLevel: 'HIGH_RISK',
    },
  );

  const earbuds = tech.products[0]!;
  const variant = earbuds.variants[0]!;

  // Pending bKash verification order
  const pendingExists = await prisma.order.findFirst({
    where: {
      storeId: tech.store.id,
      orderNumber: 'CN-SEED-BKASH-001',
    },
  });
  if (!pendingExists) {
    await prisma.order.create({
      data: {
        storeId: tech.store.id,
        customerId: goodCustomer.id,
        orderNumber: 'CN-SEED-BKASH-001',
        status: 'PENDING',
        paymentMethod: PaymentMethod.MANUAL_BKASH,
        paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        bkashTxnId: '8N7A2BK901',
        bkashSenderPhone: '01755555555',
        bkashAmount: 2499,
        subtotal: 2499,
        deliveryCharge: 80,
        total: 2579,
        deliveryAddress: {
          label: 'Home',
          line1: '12 Gulshan Avenue',
          area: 'Gulshan',
          district: 'Dhaka',
          division: 'Dhaka',
          recipientName: 'Ayesha Rahman',
          recipientPhone: '01755555555',
        },
        items: {
          create: {
            storeId: tech.store.id,
            productId: earbuds.id,
            variantId: variant.id,
            productName: earbuds.name,
            variantLabel: variant.sku,
            unitPrice: 2499,
            quantity: 1,
            lineTotal: 2499,
          },
        },
        statusHistory: {
          create: {
            storeId: tech.store.id,
            toStatus: 'PENDING',
            note: 'Seeded pending bKash order',
          },
        },
      },
    });
  }

  // COD pending order for caution customer
  const codExists = await prisma.order.findFirst({
    where: { storeId: tech.store.id, orderNumber: 'CN-SEED-COD-001' },
  });
  if (!codExists) {
    await prisma.order.create({
      data: {
        storeId: tech.store.id,
        customerId: cautionCustomer.id,
        orderNumber: 'CN-SEED-COD-001',
        status: 'PENDING',
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 1299,
        deliveryCharge: 80,
        total: 1379,
        deliveryAddress: {
          label: 'Office',
          line1: '45 Banani Road',
          area: 'Banani',
          district: 'Dhaka',
          division: 'Dhaka',
          recipientName: 'Imran Hossain',
          recipientPhone: '01766666666',
        },
        items: {
          create: {
            storeId: tech.store.id,
            productId: tech.products[1]!.id,
            variantId: tech.products[1]!.variants[0]!.id,
            productName: tech.products[1]!.name,
            variantLabel: tech.products[1]!.variants[0]!.sku,
            unitPrice: 1299,
            quantity: 1,
            lineTotal: 1299,
          },
        },
        statusHistory: {
          create: {
            storeId: tech.store.id,
            toStatus: 'PENDING',
            note: 'Seeded COD order',
          },
        },
      },
    });
  }

  // Sample delivered order for high-risk customer at Rahim
  const glass = rahim.products[0]!;
  const deliveredExists = await prisma.order.findFirst({
    where: { storeId: rahim.store.id, orderNumber: 'CN-SEED-DEL-001' },
  });
  if (!deliveredExists) {
    const cust = await ensureCustomer(
      rahim.store.id,
      highRiskCustomer.phone!,
      highRiskCustomer.name,
      {
        totalOrders: 5,
        deliveredOrders: 1,
        refusedOrders: 4,
        riskLevel: 'HIGH_RISK',
      },
    );
    await prisma.order.create({
      data: {
        storeId: rahim.store.id,
        customerId: cust.id,
        orderNumber: 'CN-SEED-DEL-001',
        status: 'DELIVERED',
        paymentMethod: PaymentMethod.MANUAL_BKASH,
        paymentStatus: PaymentStatus.APPROVED,
        isPaid: true,
        bkashTxnId: 'DELSEED001',
        bkashSenderPhone: cust.phone,
        bkashAmount: 199,
        subtotal: 199,
        deliveryCharge: 60,
        total: 259,
        deliveryAddress: {
          label: 'Home',
          line1: '9 Mirpur Road',
          area: 'Mirpur',
          district: 'Dhaka',
          division: 'Dhaka',
          recipientName: cust.name,
          recipientPhone: cust.phone,
        },
        items: {
          create: {
            storeId: rahim.store.id,
            productId: glass.id,
            variantId: glass.variants[0]!.id,
            productName: glass.name,
            variantLabel: glass.variants[0]!.sku,
            unitPrice: 199,
            quantity: 1,
            lineTotal: 199,
          },
        },
        statusHistory: {
          create: {
            storeId: rahim.store.id,
            toStatus: 'DELIVERED',
            note: 'Seeded delivered order',
          },
        },
      },
    });
  }

  await prisma.platformSettings.upsert({
    where: { key: 'platform.name' },
    create: { key: 'platform.name', value: 'CommerceNest' },
    update: { value: 'CommerceNest' },
  });

  await prisma.platformSettings.upsert({
    where: { key: 'trial.defaultDurationDays' },
    create: { key: 'trial.defaultDurationDays', value: 7 },
    update: {},
  });

  // Pricing packages — Bangladesh-focused starting defaults, fully editable
  // by Master Admin afterward via /admin/packages.
  const packageSeeds = [
    {
      name: 'Starter',
      slug: 'starter',
      description: 'For small and new businesses getting started online.',
      monthlyPrice: 499,
      displayOrder: 1,
      maxProducts: 50,
      maxStaff: 3,
      maxOrders: null as number | null,
      storageLimitMb: 500,
      trialDays: 7,
      customThemeAvailability: CustomThemeAvailability.ADDITIONAL_CHARGE,
      supportLevel: 'basic',
      featured: false,
      features: [
        'Storefront & product catalog',
        'Basic theme',
        'Cash on delivery',
        'Manual bKash payments',
        'Basic order management',
        'Basic analytics',
        'Customer management',
        'Basic support',
      ],
    },
    {
      name: 'Business',
      slug: 'business',
      description: 'For growing businesses that need more room and more tools.',
      monthlyPrice: 999,
      displayOrder: 2,
      maxProducts: 500,
      maxStaff: 10,
      maxOrders: null as number | null,
      storageLimitMb: 2000,
      trialDays: 7,
      customThemeAvailability: CustomThemeAvailability.ADDITIONAL_CHARGE,
      supportLevel: 'priority',
      featured: true,
      features: [
        'Everything in Starter',
        'More products & staff seats',
        'Coupons & discounts',
        'Advanced analytics',
        'Returns & refunds',
        'CMS tools',
        'Priority support',
      ],
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For established businesses that want the full CommerceNest experience.',
      monthlyPrice: 1999,
      displayOrder: 3,
      maxProducts: null as number | null,
      maxStaff: null as number | null,
      maxOrders: null as number | null,
      storageLimitMb: 10000,
      trialDays: 7,
      customThemeAvailability: CustomThemeAvailability.INCLUDED,
      supportLevel: 'priority',
      featured: false,
      features: [
        'Everything in Business',
        'Unlimited products & staff',
        'Advanced storefront customization service',
        'Custom theme service included',
        'Priority support',
        'Advanced analytics',
      ],
    },
  ];

  for (const pkg of packageSeeds) {
    await prisma.package.upsert({
      where: { slug: pkg.slug },
      create: { ...pkg, currency: 'BDT', active: true },
      update: {},
    });
  }

  // Prebuilt theme layouts — seeded once; Master Admin can edit/add more
  // from the Prebuilt Layouts gallery afterward.
  for (const preset of THEME_PRESETS) {
    const exists = await prisma.template.findFirst({
      where: { name: preset.name, isPreset: true },
    });
    if (exists) continue;

    const normalized = normalizeThemeDocument({
      layout: {
        sections: preset.sections.map((s, index) => ({
          id: `${s.type}_seed_${index}`,
          type: s.type,
          visible: true,
          settings: s.settings ?? {},
        })),
      },
      themeSettings: {
        colors: preset.colors,
        typography: { preset: preset.typographyPreset },
        header: { style: preset.headerStyle },
      },
    });

    await prisma.template.create({
      data: {
        name: preset.name,
        category: preset.category,
        description: preset.description,
        displayOrder: preset.displayOrder,
        isPreset: true,
        layout: normalized.layout as never,
        themeSettings: normalized.themeSettings as never,
        createdById: admin.id,
      },
    });
  }

  for (const store of [tech.store, rahim.store, urban.store]) {
    await prisma.cmsContentBlock.upsert({
      where: { storeId_key: { storeId: store.id, key: 'about' } },
      create: {
        storeId: store.id,
        key: 'about',
        fields: {
          title: `About ${store.name}`,
          body: `${store.name} is a demo CommerceNest storefront. Browse products, checkout with manual bKash, and track your orders.`,
          sortOrder: 0,
        },
      },
      update: {
        fields: {
          title: `About ${store.name}`,
          body: `${store.name} is a demo CommerceNest storefront. Browse products, checkout with manual bKash, and track your orders.`,
          sortOrder: 0,
        },
      },
    });
  }

  console.log('Seed complete.');
  console.log({
    masterAdmin: { email: admin.email, password: adminPassword },
    platformDomain: env.PLATFORM_DOMAIN,
    stores: [
      { slug: tech.store.slug, owner: 'owner@techworld.bd / Owner123!' },
      { slug: rahim.store.slug, owner: 'owner@rahimmobile.bd / Owner123!' },
      { slug: urban.store.slug, owner: 'owner@urbanthreads.bd / Owner123!' },
    ],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
