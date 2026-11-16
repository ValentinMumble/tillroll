import {describe, expect, it} from 'vitest';
import {freshPayments} from './freshPayments';
import type {Transaction} from './types';

const payment = (id: string, description: string, pending = false): Transaction => ({
  id,
  date: '2026-11-14',
  amount: -10,
  currency: 'EUR',
  description,
  kind: 'card',
  mcc: null,
  pending,
  source: 'bank',
});

describe('the payments a fetch brings in', () => {
  it('are the ones the page did not show', () => {
    const before = [payment('a', 'Carrefour City')];
    const after = [payment('a', 'Carrefour City'), payment('b', 'Photo An Oriant')];
    expect([...freshPayments(before, after)]).toEqual(['b']);
  });

  it('leave out a booked payment taking the place of a pending one of the same store', () => {
    const before = [payment('pending-1', 'Aliexpress Com', true)];
    const after = [payment('booked-1', 'ALIEXPRESS.COM'), payment('c', 'Deliveroo')];
    expect([...freshPayments(before, after)]).toEqual(['c']);
  });

  it('let each pending payment gone excuse a single new one of its store', () => {
    const before = [payment('pending-1', 'Sncf', true)];
    const after = [payment('booked-1', 'Sncf'), payment('booked-2', 'Sncf')];
    expect(freshPayments(before, after).size).toBe(1);
  });
});
