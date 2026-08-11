import { prisma } from '../lib/prisma.js';

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number) {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

async function buildRevenueSeries(storeId?: string, days = 14) {
  const keys = lastNDays(days);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      createdAt: { gte: since },
      status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED'] },
    },
    select: { createdAt: true, total: true },
  });

  const map = new Map(keys.map((k) => [k, 0]));
  for (const order of orders) {
    const key = dayKey(order.createdAt);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + Number(order.total));
    }
  }

  return keys.map((date) => ({ date, revenue: map.get(date) ?? 0 }));
}

export async function getStoreSummary(storeId: string) {
  const [
    orderCounts,
    revenueAgg,
    productCount,
    customerCount,
    pendingBkash,
    riskGroups,
    recentOrders,
    revenueSeries,
    totalOrders,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        storeId,
        status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED'] },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { storeId } }),
    prisma.order.count({
      where: {
        storeId,
        paymentMethod: 'MANUAL_BKASH',
        paymentStatus: 'PENDING_VERIFICATION',
      },
    }),
    prisma.customer.groupBy({
      by: ['riskLevel'],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true, phone: true, riskLevel: true } },
      },
    }),
    buildRevenueSeries(storeId, 14),
    prisma.order.count({ where: { storeId } }),
  ]);

  const byStatus = Object.fromEntries(
    orderCounts.map((r) => [r.status, r._count._all]),
  );
  const byRisk = Object.fromEntries(
    riskGroups.map((r) => [r.riskLevel, r._count._all]),
  );
  const revenue = Number(revenueAgg._sum.total ?? 0);

  return {
    storeId,
    // Reference-board friendly aliases
    orders: totalOrders,
    revenue,
    customers: customerCount,
    products: productCount,
    productsActive: productCount,
    pendingBkashVerifications: pendingBkash,
    ordersByStatus: byStatus,
    recognizedRevenue: revenue,
    recognizedOrderCount: revenueAgg._count._all,
    customerRiskBreakdown: byRisk,
    recentOrders,
    revenueSeries,
  };
}

export async function getPlatformSummary() {
  const [
    storeCounts,
    totalOrders,
    totalRevenue,
    pendingBkash,
    pendingBkashAmount,
    activeProducts,
    customers,
    totalUsers,
    topStoreRows,
    recentLogs,
    revenueSeries,
  ] = await Promise.all([
    prisma.store.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED'] } },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: {
        paymentMethod: 'MANUAL_BKASH',
        paymentStatus: 'PENDING_VERIFICATION',
      },
    }),
    prisma.order.aggregate({
      where: {
        paymentMethod: 'MANUAL_BKASH',
        paymentStatus: 'PENDING_VERIFICATION',
      },
      _sum: { total: true },
    }),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.customer.count(),
    prisma.user.count({
      where: { role: { not: 'MASTER_ADMIN' } },
    }),
    prisma.store.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { orders: true } },
        orders: {
          where: {
            status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED'] },
          },
          select: { total: true },
        },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        store: { select: { name: true, slug: true } },
      },
    }),
    buildRevenueSeries(undefined, 14),
  ]);

  const storesByStatus = Object.fromEntries(
    storeCounts.map((r) => [r.status, r._count._all]),
  ) as Record<string, number>;
  const totalStores = Object.values(storesByStatus).reduce((a, b) => a + b, 0);
  const activeStores = storesByStatus.ACTIVE ?? 0;
  const platformRevenue = Number(totalRevenue._sum.total ?? 0);

  const topStores = topStoreRows
    .map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      ownerName: s.owner?.name ?? '—',
      ownerEmail: s.owner?.email ?? null,
      orders: s._count.orders,
      revenue: s.orders.reduce((sum, o) => sum + Number(o.total), 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recentActivity = recentLogs.map((log) => {
    const actionLabel = log.action.replace(/_/g, ' ');
    return {
      id: log.id,
      message: log.store?.name
        ? `${actionLabel} · ${log.store.name}`
        : actionLabel,
      createdAt: log.createdAt.toISOString(),
    };
  });

  return {
    // Legacy fields
    storesByStatus,
    totalOrders,
    deliveredRevenue: platformRevenue,
    pendingBkashVerifications: pendingBkash,
    activeProducts,
    totalCustomers: customers,
    // Reference dashboard fields
    totalStores,
    activeStores,
    platformRevenue,
    totalUsers,
    pendingPayments: pendingBkash,
    pendingPaymentAmount: Number(pendingBkashAmount._sum.total ?? 0),
    revenueSeries,
    recentActivity,
    topStores,
  };
}
