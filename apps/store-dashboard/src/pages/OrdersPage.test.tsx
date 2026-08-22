import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@commercenest/ui';
import { OrdersPage } from './OrdersPage';
import { storeApi, type OrderRow } from '../lib/api';

vi.mock('../stores/authStore', () => ({
  useStoreId: () => 'store-1',
}));

const baseOrder: OrderRow = {
  id: 'order-1',
  orderNumber: 'CN-TEST-0001',
  status: 'CONFIRMED',
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentStatus: 'PENDING',
  total: 1500,
  customerName: 'Test Customer',
  customerPhone: '01900000001',
  riskLevelAtPlacement: 'NONE',
  createdAt: new Date().toISOString(),
  courierTrackingId: '',
  courierName: '',
  courierNotes: '',
  codConfirmedByCall: false,
  allowedStatusTransitions: ['PROCESSING', 'CANCELLED'],
} as unknown as OrderRow;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <OrdersPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('OrdersPage', () => {
  it('clicking anywhere on a row (not just the order ID) opens the detail drawer', async () => {
    vi.spyOn(storeApi, 'listOrders').mockResolvedValue({ items: [baseOrder], total: 1 } as never);
    vi.spyOn(storeApi, 'getOrder').mockResolvedValue(baseOrder as never);
    vi.spyOn(storeApi, 'getShipment').mockResolvedValue(null as never);

    renderPage();
    const customerCell = await screen.findByText('Test Customer');
    // Clicking a plain cell, not the order-number text itself — proves the
    // whole row is the click target, not just that one element.
    fireEvent.click(customerCell);

    await waitFor(() => expect(screen.getByText('01900000001')).toBeInTheDocument());
  });

  it('the status dropdown only ever offers this order\'s real allowedStatusTransitions', async () => {
    vi.spyOn(storeApi, 'listOrders').mockResolvedValue({ items: [baseOrder], total: 1 } as never);
    vi.spyOn(storeApi, 'getOrder').mockResolvedValue(baseOrder as never);
    vi.spyOn(storeApi, 'getShipment').mockResolvedValue(null as never);

    renderPage();
    const customerCell = await screen.findByText('Test Customer');
    fireEvent.click(customerCell);

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Mark PROCESSING', 'Mark CANCELLED']);
    // Never offers a status outside allowedStatusTransitions (e.g. DELIVERED
    // is not legal straight from CONFIRMED).
    expect(options).not.toContain('Mark DELIVERED');
  });

  it('selecting a status and clicking Update status calls updateOrderStatus with that exact status', async () => {
    vi.spyOn(storeApi, 'listOrders').mockResolvedValue({ items: [baseOrder], total: 1 } as never);
    vi.spyOn(storeApi, 'getOrder').mockResolvedValue(baseOrder as never);
    vi.spyOn(storeApi, 'getShipment').mockResolvedValue(null as never);
    const updateSpy = vi.spyOn(storeApi, 'updateOrderStatus').mockResolvedValue(baseOrder as never);

    renderPage();
    fireEvent.click(await screen.findByText('Test Customer'));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CANCELLED' } });
    fireEvent.click(screen.getByText('Update status'));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'store-1',
        'order-1',
        expect.objectContaining({ status: 'CANCELLED' }),
      ),
    );
  });

  it('"Confirm COD by call" sends an empty body — not { codConfirmedByCall: true }, which the backend schema rejects', async () => {
    vi.spyOn(storeApi, 'listOrders').mockResolvedValue({ items: [baseOrder], total: 1 } as never);
    vi.spyOn(storeApi, 'getOrder').mockResolvedValue(baseOrder as never);
    vi.spyOn(storeApi, 'getShipment').mockResolvedValue(null as never);
    const confirmCodSpy = vi.spyOn(storeApi, 'confirmCod').mockResolvedValue(baseOrder as never);

    renderPage();
    fireEvent.click(await screen.findByText('Test Customer'));
    const confirmButton = await screen.findByText('Confirm COD by call');
    fireEvent.click(confirmButton);

    await waitFor(() => expect(confirmCodSpy).toHaveBeenCalledWith('store-1', 'order-1', {}));
  });
});
