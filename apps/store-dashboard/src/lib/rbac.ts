const ALL = [
  'STORE_OWNER',
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
] as const;

export type NavKey =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'categories'
  | 'coupons'
  | 'returns'
  | 'customers'
  | 'payments'
  | 'billing'
  | 'analytics'
  | 'cms'
  | 'media'
  | 'theme'
  | 'announcements'
  | 'support'
  | 'settings';

const permissions: Record<NavKey, readonly string[]> = {
  dashboard: ALL,
  orders: ['STORE_OWNER', 'STORE_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'],
  products: ['STORE_OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'],
  categories: ['STORE_OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'],
  coupons: ['STORE_OWNER', 'STORE_MANAGER'],
  returns: ['STORE_OWNER', 'STORE_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'],
  customers: ['STORE_OWNER', 'STORE_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'],
  payments: ['STORE_OWNER', 'STORE_MANAGER', 'ORDER_MANAGER'],
  billing: ['STORE_OWNER', 'STORE_MANAGER'],
  analytics: ['STORE_OWNER', 'STORE_MANAGER'],
  cms: ['STORE_OWNER', 'STORE_MANAGER'],
  media: ['STORE_OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'],
  theme: ['STORE_OWNER', 'STORE_MANAGER'],
  announcements: ALL,
  support: ['STORE_OWNER', 'STORE_MANAGER'],
  settings: ['STORE_OWNER', 'STORE_MANAGER'],
};

export function canAccess(role: string | undefined, key: NavKey) {
  if (!role) return false;
  if (role === 'MASTER_ADMIN') return true;
  return permissions[key].includes(role);
}
