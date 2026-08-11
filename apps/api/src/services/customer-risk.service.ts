import { CustomerRiskLevel, type CustomerRiskLevel as Risk } from '@commercenest/types';

/**
 * Part 10.2 — exact customer risk thresholds (store-history only).
 *
 * refusedOrders < 2                              -> NONE
 * refusedOrders >= 2                             -> CAUTION
 * refusedOrders >= 2 AND refusalRate > 0.40      -> HIGH_RISK
 *
 * refusalRate = refusedOrders / totalOrders
 * Recalculate only on DELIVERED / RETURNED transitions.
 */
export interface RiskCounters {
  totalOrders: number;
  deliveredOrders: number;
  refusedOrders: number;
}

export type RiskTransition = 'DELIVERED' | 'RETURNED';

export function applyRiskTransition(
  current: RiskCounters,
  transition: RiskTransition,
): RiskCounters {
  if (transition === 'DELIVERED') {
    return {
      totalOrders: current.totalOrders + 1,
      deliveredOrders: current.deliveredOrders + 1,
      refusedOrders: current.refusedOrders,
    };
  }
  return {
    totalOrders: current.totalOrders + 1,
    deliveredOrders: current.deliveredOrders,
    refusedOrders: current.refusedOrders + 1,
  };
}

export function calculateRiskLevel(counters: RiskCounters): Risk {
  const { totalOrders, refusedOrders } = counters;

  if (refusedOrders < 2) {
    return CustomerRiskLevel.NONE;
  }

  const refusalRate = totalOrders > 0 ? refusedOrders / totalOrders : 0;

  if (refusedOrders >= 2 && refusalRate > 0.4) {
    return CustomerRiskLevel.HIGH_RISK;
  }

  return CustomerRiskLevel.CAUTION;
}

export function recalculateRisk(
  current: RiskCounters,
  transition: RiskTransition,
): { counters: RiskCounters; riskLevel: Risk } {
  const counters = applyRiskTransition(current, transition);
  return {
    counters,
    riskLevel: calculateRiskLevel(counters),
  };
}
