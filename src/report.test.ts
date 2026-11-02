import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {buildReport, rollingAverage, stillToCome, trendOf} from './report';
import {toRows} from './rows';
import type {Transaction} from './types';

let lastId = 0;

/** A bank payment, a card one by default, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

const categories = categoriesFrom([]);
const rowsOf = (transactions: Transaction[]) =>
  toRows(transactions, {rules: {}, categories, merges: {}, labels: {}, paymentCategories: {}});

describe('trendOf', () => {
  it('fits a straight line to the values it is given, the others left out', () => {
    const trend = trendOf([100, 200, null, 400, null]);
    expect(trend?.step).toBeCloseTo(100);
    expect(trend?.first).toBeCloseTo(100);
    expect(trend?.last).toBeCloseTo(500);
  });

  it('needs three values', () => {
    expect(trendOf([100, null, 200])).toBeNull();
  });
});

describe('rollingAverage', () => {
  it('averages each value with its neighbours, leaving the missing ones out', () => {
    expect(rollingAverage([100, 400, 100, null, 300])).toEqual([250, 200, 250, null, 300]);
  });
});

describe('the chart periods', () => {
  // A year and a bit of groceries, more each month, and the same pay on the 5th.
  const transactions: Transaction[] = [];
  for (let step = 0; step < 14; step += 1) {
    const month = new Date(Date.UTC(2025, 8 + step, 1)).toISOString().slice(0, 7);
    transactions.push(
      payment({description: 'Carrefour', amount: -(100 + step * 10), date: `${month}-03`, mcc: '5411'}),
    );
    transactions.push(payment({description: 'Acme', kind: 'income', amount: 2000, date: `${month}-05`}));
  }
  const report = buildReport(rowsOf(transactions), '2026-10', 'month', '2026-10-15', categories);
  const october = report.series.find(item => item.period === '2026-10');

  it('tells what the same month cost a year before', () => {
    expect(october?.lastYear).toBe(110);
  });

  it('counts the pay in each month', () => {
    expect(october?.pay).toBe(2000);
  });

  it('says where the month still going should land, never under what it cost so far', () => {
    expect(october?.projected).not.toBeNull();
    expect(october?.projected ?? 0).toBeGreaterThanOrEqual(october?.total ?? 0);
  });
});

describe('stillToCome', () => {
  // A streaming service on the 10th and a gym on the 3rd, from July; in November only the gym has come so far.
  const transactions: Transaction[] = [];
  for (const month of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    transactions.push(payment({description: 'Netflix', amount: -12.99, date: `${month}-10`}));
    transactions.push(payment({description: 'Gym', amount: -30, date: `${month}-03`}));
  }
  transactions.push(payment({description: 'Gym', amount: -30, date: '2026-11-03'}));
  const rows = rowsOf(transactions);
  const report = buildReport(rows, '2026-11', 'month', '2026-11-08', categories);

  it('lists the regular payments not charged yet this month, on their usual day', () => {
    expect(stillToCome(report.subscriptions, rows, '2026-11').map(entry => [entry.item.store, entry.date])).toEqual([
      ['Netflix', '2026-11-10'],
    ]);
  });
});
