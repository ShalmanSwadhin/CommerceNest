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
