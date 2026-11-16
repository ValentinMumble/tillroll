import {describe, expect, it} from 'vitest';
import type {Transaction} from '../../src/types';
import {matchBooked} from './pending';

let lastId = 0;

/** A Revolut card payment, pending or booked: every one's id starts alike, as Enable Banking's do. */
function payment(date: string, amount: number, description: string, fields: Partial<Transaction> = {}): Transaction {
  lastId += 1;
  return {
    id: `bank:WwpbCiJhY2Nv:${lastId}`,
    date,
    amount,
    currency: 'EUR',
    description,
    kind: 'card',
    mcc: null,
    pending: false,
    source: 'bank',
    bank: 'Revolut',
    ...fields,
  };
}

describe('the booked payment that takes a pending one’s place', () => {
  it('is the one of the same amount, the nearest day first', () => {
    const pending = payment('2026-11-01', -51, 'Pk Lorient', {pending: true});
    const far = payment('2026-11-09', -51, 'Pk Lorient');
    const near = payment('2026-11-02', -51, 'Pk Lorient');
    expect(matchBooked([pending], [far, near]).get(pending.id)).toBe(near);
  });

  it('is the same store’s for a hold booked for less, or a tip for more', () => {
    const parking = payment('2026-11-01', -100, 'PK LORIENT', {pending: true});
    const dinner = payment('2026-11-01', -40, 'Café Diem', {pending: true});
    const booked = [payment('2026-11-02', -51, 'Pk Lorient'), payment('2026-11-03', -46, 'Cafe Diem')];
    const matches = matchBooked([parking, dinner], booked);
    expect(matches.get(parking.id)).toBe(booked[0]);
    expect(matches.get(dinner.id)).toBe(booked[1]);
  });

  it('leaves an exact amount to its own pending payment before any hold takes it', () => {
    const hold = payment('2026-11-01', -25, 'Cafe Diem', {pending: true});
    const exact = payment('2026-11-01', -20, 'Cafe Diem', {pending: true});
    const twenty = payment('2026-11-02', -20, 'Cafe Diem');
    const other = payment('2026-11-02', -24, 'Cafe Diem');
    const matches = matchBooked([hold, exact], [twenty, other]);
    expect(matches.get(exact.id)).toBe(twenty);
    expect(matches.get(hold.id)).toBe(other);
  });

  it('is none for another store, another currency, a far day or an amount too far off', () => {
    const pending = payment('2026-11-01', -100, 'Pk Lorient', {pending: true});
    const booked = [
      payment('2026-11-02', -51, 'Pk Vannes'),
      payment('2026-11-02', -51, 'Pk Lorient', {currency: 'GBP'}),
      payment('2026-11-20', -51, 'Pk Lorient'),
      payment('2026-11-02', -30, 'Pk Lorient'),
    ];
    expect(matchBooked([pending], booked).size).toBe(0);
  });
});
