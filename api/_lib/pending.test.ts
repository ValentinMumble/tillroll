import {describe, expect, it} from 'vitest';
import type {Transaction} from '../../src/types';
import {matchBooked, replaced} from './pending';

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

describe('the pending payments a sync replaces', () => {
  it('leave out one booked under the id it had while pending, as Revolut books them', () => {
    const pending = payment('2026-11-14', -110.69, 'Aliexpress.com', {pending: true});
    const booked = {...pending, pending: false};
    expect(replaced([pending], [], [booked])).toEqual({gone: [], candidates: []});
  });

  it('never give a payment that kept its id to another pending one of the same amount', () => {
    const kept = payment('2026-11-14', -20, 'Cafe Diem', {pending: true});
    const renamed = payment('2026-11-14', -20, 'Cafe Diem', {pending: true});
    const bookedKept = {...kept, pending: false};
    const bookedRenamed = payment('2026-11-15', -20, 'Cafe Diem');
    const {gone, candidates} = replaced([kept, renamed], [], [bookedKept, bookedRenamed]);
    expect(gone).toEqual([renamed]);
    expect(candidates).toEqual([bookedRenamed]);
  });

  it('are the ones gone, with what the sync brought', () => {
    const still = payment('2026-11-14', -5, 'Boulangerie', {pending: true});
    const old = payment('2026-11-14', -9, 'Sncf', {pending: true});
    const next = payment('2026-11-15', -9, 'Sncf');
    const fresh = payment('2026-11-16', -3, 'Kiosque', {pending: true});
    expect(replaced([still, old], [still, fresh], [next])).toEqual({gone: [old], candidates: [next, fresh]});
  });
});

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
