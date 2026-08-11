import { describe, expect, it } from 'vitest';
import {
  calculateRiskLevel,
  recalculateRisk,
} from './customer-risk.service.js';

describe('customer-risk.service (Part 10.2)', () => {
  it('returns NONE when refusedOrders < 2', () => {
    expect(
      calculateRiskLevel({
        totalOrders: 10,
        deliveredOrders: 9,
        refusedOrders: 1,
      }),
    ).toBe('NONE');
    expect(
      calculateRiskLevel({
        totalOrders: 0,
        deliveredOrders: 0,
        refusedOrders: 0,
      }),
    ).toBe('NONE');
  });

  it('returns CAUTION at exactly 2 refused when refusalRate <= 0.40', () => {
    // 2/5 = 0.40 — not greater than 0.40 => CAUTION
    expect(
      calculateRiskLevel({
        totalOrders: 5,
        deliveredOrders: 3,
        refusedOrders: 2,
      }),
    ).toBe('CAUTION');
  });

  it('returns HIGH_RISK when refusedOrders >= 2 AND refusalRate > 0.40', () => {
    // 3/5 = 0.60
    expect(
      calculateRiskLevel({
        totalOrders: 5,
        deliveredOrders: 2,
        refusedOrders: 3,
      }),
    ).toBe('HIGH_RISK');
  });

  it('recalculates counters on DELIVERED / RETURNED', () => {
    const delivered = recalculateRisk(
      { totalOrders: 1, deliveredOrders: 1, refusedOrders: 0 },
      'DELIVERED',
    );
    expect(delivered.counters).toEqual({
      totalOrders: 2,
      deliveredOrders: 2,
      refusedOrders: 0,
    });
    expect(delivered.riskLevel).toBe('NONE');

    // 1 refused of 4, then another return => 2/5 = 0.40 => CAUTION (not > 0.40)
    const returned = recalculateRisk(
      { totalOrders: 4, deliveredOrders: 3, refusedOrders: 1 },
      'RETURNED',
    );
    expect(returned.counters).toEqual({
      totalOrders: 5,
      deliveredOrders: 3,
      refusedOrders: 2,
    });
    expect(returned.riskLevel).toBe('CAUTION');
  });
});
