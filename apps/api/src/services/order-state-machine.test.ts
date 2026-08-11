import { describe, expect, it } from 'vitest';
import { canTransition, ORDER_TRANSITIONS } from './order.service.js';

describe('order status state machine', () => {
  it('allows happy-path transitions', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('allows cancel from PENDING/CONFIRMED and return from SHIPPED', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('SHIPPED', 'RETURNED')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('PENDING', 'SHIPPED')).toBe(false);
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'RETURNED')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('PROCESSING', 'CANCELLED')).toBe(false);
  });

  it('terminal states have no outgoing edges', () => {
    expect(ORDER_TRANSITIONS.DELIVERED).toEqual([]);
    expect(ORDER_TRANSITIONS.RETURNED).toEqual([]);
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });
});
