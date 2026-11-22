import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {localDay, localTime} from './periods';
import {bankMergeKey, matchesSearch, type Row, searchTerms, toRows} from './rows';
import type {Transaction} from './types';

let lastId = 0;

/** A bank payment, a card one by default, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

function rowsOf(transactions: Transaction[], paymentCategories: Record<string, string> = {}) {
  const rows = toRows(transactions, {
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories,
  });
  return (transaction: Transaction) => rows.find(row => row.id === transaction.id) as Row;
}

describe('PayPal', () => {
  it('counts a purchase once, at its shop, and the bank payment that paid it as a move', () => {
    const shop = payment({bank: 'PayPal', description: 'Bandcamp', amount: -10, date: '2026-10-01'});
    const bank = payment({description: 'PAYPAL *BANDCAMP', amount: -10, date: '2026-10-02'});
    const row = rowsOf([shop, bank]);
    expect(row(bank).category).toBe('own');
    expect(row(bank).spend).toBe(0);
    expect(row(bank).viaPayPal).toBe(true);
    expect(row(shop).spend).toBe(10);
  });

  it('marks a card payment naming the shop, paired with PayPal’s top-up, as paid via PayPal', () => {
    const shop = payment({
      bank: 'PayPal',
      description: 'MGP Vinted - Kleiderkreisel',
      amount: -11.84,
      date: '2022-09-15',
    });
    const topUp = payment({
      bank: 'PayPal',
      description: 'Dépôt sur carte standard',
      kind: 'topup',
      amount: 11.84,
      date: '2022-09-15',
    });
    const card = payment({description: 'Vinted', amount: -11.84, date: '2022-09-15'});
    const row = rowsOf([shop, topUp, card]);
    expect(row(card).category).toBe('own');
    expect(row(card).viaPayPal).toBe(true);
    expect(row(shop).spend).toBe(11.84);
  });

  it('pairs a withdrawal with the bank money in of as much, both moves', () => {
    const out = payment({bank: 'PayPal', description: 'Unknown', kind: 'transfer', amount: -50, date: '2026-10-05'});
    const back = payment({description: 'PAYPAL EUROPE', kind: 'income', amount: 50, date: '2026-10-06'});
    const row = rowsOf([out, back]);
    expect(row(out).category).toBe('own');
    expect(row(back).category).toBe('own');
  });

  it('pairs a purchase with a card payment naming the shop instead of PayPal', () => {
    const shop = payment({bank: 'PayPal', description: 'AliExpress', amount: -23.45, date: '2026-10-03'});
    const card = payment({description: 'Alipay', amount: -23.45, date: '2026-10-04'});
    const row = rowsOf([shop, card]);
    expect(row(card).category).toBe('own');
    expect(row(shop).spend).toBe(23.45);
  });

  it('pairs a purchase in another currency on the shop’s first word, the closest in time', () => {
    const shop = payment({
      bank: 'PayPal',
      description: 'VeloViewer Ltd',
      currency: 'GBP',
      amount: -10,
      date: '2026-10-10',
    });
    const far = payment({description: 'Paypal *veloviewer', amount: -11.7, date: '2026-10-07'});
    const near = payment({description: 'Paypal *veloviewer', amount: -11.8, date: '2026-10-11'});
    const row = rowsOf([shop, far, near]);
    expect(row(near).viaPayPal).toBe(true);
    expect(row(far).viaPayPal).toBe(false);
  });
});

describe('refunds', () => {
  it('gives a refund back to the payment it matches', () => {
    const bought = payment({description: 'FNAC', amount: -40, date: '2026-09-01'});
    const refund = payment({description: 'FNAC', kind: 'refund', amount: 15, date: '2026-09-10'});
    const row = rowsOf([bought, refund]);
    expect(row(refund).refundOf?.id).toBe(bought.id);
    expect(row(refund).spend).toBe(0);
    expect(row(bought).spend).toBe(25);
  });

  it('leaves a refund older than any payment at the store unmatched', () => {
    const refund = payment({description: 'FNAC', kind: 'refund', amount: 15, date: '2026-09-10'});
    const later = payment({description: 'FNAC', amount: -40, date: '2026-09-20'});
    const row = rowsOf([refund, later]);
    expect(row(refund).refundOf).toBeNull();
    expect(row(later).spend).toBe(40);
  });
});

describe('paybacks', () => {
  const sorting = (paybacks: Record<string, string>) => ({
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories: {},
    paybacks,
  });

  it('takes a friend’s share off the payment it pays back, in that payment’s month', () => {
    const flat = payment({description: 'Airbnb', amount: -865.82, date: '2026-09-22', mcc: '7011'});
    const share = payment({description: 'Alexandre Mazure', kind: 'income', amount: 286, date: '2026-10-03'});
    const rows = toRows([flat, share], sorting({[share.id]: flat.id}));
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(flat).spend).toBeCloseTo(579.82);
    expect(row(share).spend).toBe(0);
    expect(row(share).category).toBe(row(flat).category);
    expect(row(share).refundOf).toMatchObject({id: flat.id, store: 'Airbnb', byHand: true});
  });

  it('lets a payback round a payment up, which then costs nothing', () => {
    const stay = payment({description: 'AIRBNB * HMA8WY', amount: -17.99, date: '2026-10-20'});
    const share = payment({description: 'MR Dubost Axel', kind: 'income', amount: 18, date: '2026-10-26'});
    const rows = toRows([stay, share], sorting({[share.id]: stay.id}));
    expect(rows.find(item => item.id === stay.id)?.spend).toBe(0);
    expect(rows.find(item => item.id === share.id)?.spend).toBe(0);
  });

  it('lets a payback add a little on top, which lowers its own month’s spending', () => {
    const pizza = payment({description: 'Pizza Posto', amount: -26.5, date: '2026-05-03'});
    const share = payment({description: 'Anne-Cecile Martinet', kind: 'income', amount: 30, date: '2026-05-03'});
    const rows = toRows([pizza, share], sorting({[share.id]: pizza.id}));
    expect(rows.find(item => item.id === pizza.id)?.spend).toBe(0);
    expect(rows.find(item => item.id === share.id)?.refundOf).toMatchObject({id: pizza.id, byHand: true});
    expect(rows.find(item => item.id === share.id)?.spend).toBe(-3.5);
  });

  it('pays back what is left of a payment when something is sold on for more', () => {
    const order = payment({description: 'Lordgun', amount: -238.99, date: '2023-06-14'});
    const part = payment({description: 'Leboncoin', kind: 'income', amount: 159.5, date: '2024-03-02'});
    const sale = payment({description: 'LBC France SAS', kind: 'income', amount: 280, date: '2025-07-21'});
    const rows = toRows([order, part, sale], sorting({[part.id]: order.id, [sale.id]: order.id}));
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(order).spend).toBe(0);
    expect(row(part).spend).toBe(0);
    expect(row(sale).beyond).toBeCloseTo(200.51);
    expect(row(sale).spend).toBeCloseTo(-200.51);
  });

  it('pays back a payment the bank has not booked yet', () => {
    const dinner = payment({description: 'Le Comptoir', amount: -84, date: '2026-11-09', pending: true});
    const share = payment({description: 'Alexandre Mazure', kind: 'income', amount: 42, date: '2026-11-10'});
    const rows = toRows([dinner, share], sorting({[share.id]: dinner.id}));
    expect(rows.find(item => item.id === dinner.id)?.spend).toBe(42);
    expect(rows.find(item => item.id === share.id)?.refundOf).toMatchObject({id: dinner.id, byHand: true});
  });

  it('leaves aside a link to a payment paid back in full already', () => {
    const coffee = payment({description: 'Cafe Pop', amount: -4.5, date: '2026-09-22'});
    const first = payment({description: 'Alexandre Mazure', kind: 'income', amount: 4.5, date: '2026-09-23'});
    const second = payment({description: 'Alexandre Mazure', kind: 'income', amount: 4.5, date: '2026-09-24'});
    const rows = toRows([coffee, first, second], sorting({[first.id]: coffee.id, [second.id]: coffee.id}));
    expect(rows.find(item => item.id === first.id)?.refundOf).not.toBeNull();
    expect(rows.find(item => item.id === second.id)?.refundOf).toBeNull();
  });
});

describe('sales', () => {
  it('lowers its own category’s spending, not the latest payment at its store', () => {
    const racket = payment({description: 'Leboncoin', amount: -74.2, date: '2025-06-12'});
    const sale = payment({description: 'Leboncoin', kind: 'income', amount: 35, date: '2025-08-04'});
    const bike = categoriesFrom([{key: 'bike', label: 'Bike', icon: '🚲', spending: true}]);
    const rows = toRows([racket, sale], {
      rules: {},
      categories: bike,
      merges: {},
      labels: {},
      paymentCategories: {[racket.id]: 'fun', [sale.id]: 'bike'},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(sale).refundOf).toBeNull();
    expect(row(sale).spend).toBe(-35);
    expect(row(sale).refund).toBe(false);
    expect(row(racket).spend).toBe(74.2);
  });

  it('never gives back a payment of the same category with other labels', () => {
    const bag = payment({description: 'Leboncoin', amount: -102.79, date: '2024-01-02'});
    const sale = payment({description: 'Leboncoin', kind: 'income', amount: 50, date: '2024-03-05'});
    const rows = toRows([bag, sale], {
      rules: {},
      categories: categoriesFrom([]),
      merges: {},
      labels: {[bag.id]: ['Sacoche Ortlieb'], [sale.id]: ['Restrap']},
      paymentCategories: {[bag.id]: 'shopping', [sale.id]: 'shopping'},
    });
    expect(rows.find(item => item.id === sale.id)?.refundOf).toBeNull();
  });

  it('still gives back a payment of its category, a refund sent by transfer', () => {
    const ticket = payment({description: 'SNCF', amount: -176, date: '2026-07-26'});
    const refund = payment({description: 'SNCF', kind: 'income', amount: 88, date: '2026-08-03'});
    const rows = toRows([ticket, refund], {
      rules: {sncf: 'transport'},
      categories: categoriesFrom([]),
      merges: {},
      labels: {},
      paymentCategories: {[refund.id]: 'transport'},
    });
    expect(rows.find(item => item.id === refund.id)?.refundOf?.id).toBe(ticket.id);
    expect(rows.find(item => item.id === ticket.id)?.spend).toBe(88);
  });
});

describe('card refunds named after the holder', () => {
  const sorting = {
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories: {},
    me: ['Valentin Dijkstra'],
  };

  it('gives back the card payment of the same amount, a shop’s refund', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, refund], sorting);
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(refund).refundOf).toMatchObject({id: order.id, store: 'Amazon', byHand: false});
    expect(row(order).spend).toBe(0);
  });

  it('gives back the latest such payment of the 120 days before, never a later or an older one', () => {
    const old = payment({description: 'Decathlon', amount: -30, date: '2026-05-01'});
    const latest = payment({description: 'Fnac', amount: -30, date: '2026-09-20'});
    const earlier = payment({description: 'Amazon', amount: -30, date: '2026-09-02'});
    const after = payment({description: 'Zalando', amount: -30, date: '2026-10-29'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 30, date: '2026-10-28'});
    const rows = toRows([old, latest, earlier, after, refund], sorting);
    expect(rows.find(item => item.id === refund.id)?.refundOf?.id).toBe(latest.id);
  });

  it('leaves it unmatched when the only such payment is more than 120 days older', () => {
    const old = payment({description: 'Decathlon', amount: -30, date: '2026-05-01'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 30, date: '2026-10-28'});
    const rows = toRows([old, refund], sorting);
    expect(rows.find(item => item.id === refund.id)?.refundOf).toBeNull();
  });

  it('still gives it back when its store is renamed into one filed under moves between my accounts', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, refund], {
      ...sorting,
      rules: {'other account': 'own'},
      merges: {'valentin jan dijkstra': 'Valentin Dijkstra', 'valentin dijkstra': 'Other account'},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(refund).store).toBe('Other account');
    expect(row(refund).refundOf).toMatchObject({id: order.id, store: 'Amazon'});
    expect(row(order).spend).toBe(0);
  });

  it('stays a move between one’s accounts when as much left another bank', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const sent = payment({
      bank: 'Crédit Coopératif',
      description: 'VIR SEPA Valentin Dijkstra',
      kind: 'transfer',
      amount: -12.57,
      date: '2026-10-27',
    });
    const received = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, sent, received], sorting);
    expect(rows.find(item => item.id === received.id)?.refundOf).toBeNull();
    expect(rows.find(item => item.id === order.id)?.spend).toBe(12.57);
  });

  it('never gives back a card top-up of another account', () => {
    const topUp = payment({description: 'Revolut', amount: -1000, date: '2026-08-17'});
    const fromSavings = payment({
      description: 'VIR SEPA M DIJKSTRA VALENTIN',
      kind: 'income',
      amount: 1000,
      date: '2026-08-17',
    });
    const rows = toRows([topUp, fromSavings], {
      ...sorting,
      rules: {revolut: 'own', 'vir sepa m dijkstra valentin': 'own'},
    });
    expect(rows.find(item => item.id === fromSavings.id)?.refundOf).toBeNull();
  });
});

describe('merges', () => {
  it('merges one bank’s payments only, before the store’s own merge', () => {
    const coop = payment({
      bank: 'Crédit Coopératif',
      description: 'VIREMENT VERS VALENTIN DIJKSTRA',
      amount: -1000,
      date: '2026-05-11',
    });
    const revolut = payment({description: 'To Valentin Dijkstra', kind: 'transfer', amount: -50, date: '2022-09-27'});
    const rows = toRows([coop, revolut], {
      rules: {},
      categories: categoriesFrom([]),
      merges: {
        [bankMergeKey('valentin dijkstra', 'Crédit Coopératif')]: 'To Revolut',
        'valentin dijkstra': 'Other account',
      },
      labels: {},
      paymentCategories: {},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(coop).store).toBe('To Revolut');
    expect(row(coop).partName).toBe('Valentin Dijkstra (Crédit Coopératif)');
    expect(row(revolut).store).toBe('Other account');
    expect(row(revolut).partKey).toBe('valentin dijkstra');
  });
});

describe('days and picks', () => {
  it('dates a deferred debit card payment on the day it was paid', () => {
    const deferred = payment({description: 'CB CAFE POP FACT 270826', amount: -4.5, date: '2026-09-01'});
    expect(rowsOf([deferred])(deferred).date).toBe('2026-08-27');
  });

  it('gives a store and amount the category picked twice for it', () => {
    const first = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-08-05'});
    const second = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-09-05'});
    const third = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-10-05'});
    const row = rowsOf([first, second, third], {[first.id]: 'home', [second.id]: 'home'});
    expect(row(third).category).toBe('home');
    expect(row(third).basis).toBe('picked');
  });
});

describe('A store category from one payment on', () => {
  const categories = categoriesFrom([]);
  const sorted = (transactions: Transaction[], rules: Record<string, string>, earlierRules = {}) => {
    const rows = toRows(transactions, {rules, earlierRules, categories, merges: {}, labels: {}, paymentCategories: {}});
    return (transaction: Transaction) => rows.find(row => row.id === transaction.id) as Row;
  };

  it('keeps the earlier category for the payments before its day', () => {
    const old = payment({description: 'Cat Sitter', amount: -20, date: '2026-10-01'});
    const sameDay = payment({description: 'Cat Sitter', amount: -20, date: '2026-11-05'});
    const later = payment({description: 'Cat Sitter', amount: -20, date: '2026-11-20'});
    const key = sorted([old], {})(old).storeKey;
    const row = sorted(
      [old, sameDay, later],
      {[key]: 'health'},
      {[key]: [{until: '2026-11-05', category: 'groceries'}]},
    );
    expect(row(old).category).toBe('groceries');
    expect(row(sameDay).category).toBe('health');
    expect(row(later).category).toBe('health');
    expect(row(old).basis).toBe('picked');
  });

  it('goes back to the guess before its day when the store had no category then', () => {
    const old = payment({description: 'Cat Sitter', amount: -20, date: '2026-10-01', kind: 'transfer'});
    const later = payment({description: 'Cat Sitter', amount: -20, date: '2026-11-20', kind: 'transfer'});
    const key = sorted([old], {})(old).storeKey;
    const row = sorted([old, later], {[key]: 'health'}, {[key]: [{until: '2026-11-05', category: null}]});
    expect(row(old).category).toBe('transfers');
    expect(row(later).category).toBe('health');
  });
});

describe('search', () => {
  const lidl = payment({description: 'LIDL 1234', amount: -23.4, date: '2026-11-10'});
  const aldi = payment({description: 'ALDI MARCHE', amount: -448.8, date: '2026-11-11'});
  const cafe = payment({description: 'Café Diem', amount: -4.5, date: '2026-11-12'});
  const row = rowsOf([lidl, aldi, cafe]);
  const found = (query: string) =>
    [lidl, aldi, cafe].filter(item => matchesSearch(row(item), searchTerms(query))).map(item => item.description);

  it('finds every word of one search, an amount with its sign or currency', () => {
    expect(found('aldi marche')).toEqual(['ALDI MARCHE']);
    expect(found('-448,80 €')).toEqual(['ALDI MARCHE']);
    expect(found('cafe')).toEqual(['Café Diem']);
  });

  it('finds either side of an or, or of a |', () => {
    expect(found('lidl or aldi')).toEqual(['LIDL 1234', 'ALDI MARCHE']);
    expect(found('lidl OR cafe diem')).toEqual(['LIDL 1234', 'Café Diem']);
    expect(found('lidl|aldi')).toEqual(['LIDL 1234', 'ALDI MARCHE']);
  });

  it('is no search when empty, and ignores an or left alone while typing', () => {
    expect(searchTerms('  ')).toEqual([]);
    expect(found('')).toHaveLength(3);
    expect(searchTerms('lidl or')).toEqual([['lidl']]);
  });
});

describe('a day’s payments', () => {
  const sorting = {rules: {}, categories: categoriesFrom([]), merges: {}, labels: {}, paymentCategories: {}};
  // A Revolut id, whose UUID starts with the seconds since 1970.
  const revolutId = (at: string) =>
    `bank:WwpbCiJhY2Nv:${Math.floor(Date.parse(at) / 1000).toString(16)}-b652-a674-a3d4-808c82218fd0`;

  it('take a Revolut payment’s time from its id', () => {
    const westport = payment({
      id: revolutId('2026-11-17T19:58:19Z'),
      bank: 'Revolut',
      description: 'Westport',
      amount: -19.9,
      date: '2026-11-17',
    });
    const row = rowsOf([westport]);
    expect(row(westport).time).toBe(localTime(new Date('2026-11-17T19:58:19Z')));
  });

  it('put a Revolut payment under its own day, not the UTC day Revolut gives', () => {
    // 00:58 in Paris, a day after Revolut's date.
    const madeAt = new Date('2026-11-21T23:58:58Z');
    const kebab = payment({
      id: revolutId(madeAt.toISOString()),
      bank: 'Revolut',
      description: 'Kebab',
      amount: -9.5,
      date: '2026-11-21',
    });
    const row = rowsOf([kebab]);
    expect(row(kebab).date).toBe(localDay(madeAt));
    expect(row(kebab).time).toBe(localTime(madeAt));
  });

  it('take no time from another bank’s id, or from one far from its day', () => {
    const other = payment({
      id: revolutId('2026-11-17T19:58:19Z'),
      bank: 'Crédit Coopératif',
      description: 'Leclerc',
      amount: -49.83,
      date: '2026-11-17',
    });
    const far = payment({id: revolutId('2026-10-01T10:00:00Z'), description: 'Amazon', amount: -9, date: '2026-11-17'});
    const row = rowsOf([other, far]);
    expect(row(other).time).toBeUndefined();
    expect(row(far).time).toBeUndefined();
  });

  it('come newest first: by time, then by when the sync first saw them, one seen a day later on top', () => {
    const day = '2026-11-17';
    const list = [
      payment({description: 'Morning', amount: -1, date: day, time: '09:00'}),
      payment({description: 'Evening', amount: -2, date: day, time: '19:00'}),
      payment({description: 'Seen next day', amount: -3, date: day, seenAt: '2026-11-18T08:00:00Z'}),
      payment({description: 'Seen at noon', amount: -4, date: day, seenAt: new Date(`${day}T12:00:00`).toISOString()}),
      payment({description: 'Never seen', amount: -5, date: day}),
      payment({description: 'Next day', amount: -6, date: '2026-11-18'}),
    ];
    expect(toRows(list, sorting).map(row => row.description)).toEqual([
      'Next day',
      'Seen next day',
      'Evening',
      'Seen at noon',
      'Morning',
      'Never seen',
    ]);
  });
});
