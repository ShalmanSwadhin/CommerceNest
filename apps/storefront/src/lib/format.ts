export function formatBdt(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(n)) return '৳0';
  return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 })
    .format(n).replace('BDT', '৳').replace(/\s/g, '');
}
export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(n ?? 0);
}
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being prepared',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Handed to courier',
  IN_REVIEW: 'Courier reviewing',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  PARTIAL_DELIVERED: 'Partially delivered',
  ON_HOLD: 'On hold',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned to sender',
  FAILED: 'Status unavailable',
};
