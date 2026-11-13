import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {statementYears} from './components/StatementSection';
import {toRows} from './rows';
import {growthBetween, savingsAccounts} from './savings';
import type {SavingsStatement, Transaction} from './types';

/** A monthly debit to the assurance vie, as the current account's bank lists it. */
function debit(date: string, amount: number): Transaction {
  return {
    id: `bpce-${date}`,
    date,
    amount: -amount,
    currency: 'EUR',
    description: 'PRLV SEPA BPCE VIE',
    kind: 'transfer',
    mcc: null,
    pending: false,
    source: 'bank',
  };
}

const payment = (date: string, amount: number) => ({
  kind: 'payment' as const,
  label: `Versement programmé du ${date}`,
  date,
  amount,
  details: [],
});

// Opened in August 2024 with €1,000, then €250 a month; the bank data starts with September's debit.
const statement: SavingsStatement = {
  contract: 'MILLEVIE Essentielle 2',
  movements: [
    {...payment('2024-08-09', 1000), label: 'Versement initial du 09/08/2024'},
    payment('2024-09-05', 250),
    payment('2024-10-05', 250),
    {
      kind: 'management-fee',
      label: 'Frais de gestion sur encours du 31/12/2024',
      date: '2024-12-31',
      amount: 4,
      details: [],
    },
    {kind: 'interest', label: "Intérêts de l'année du 31/12/2024", date: '2024-12-31', amount: 12, details: []},
  ],
  values: [
    {date: '2023-12-31', value: 0, funds: []},
    {date: '2024-12-31', value: 1530, funds: [{name: 'Fonds en euros', isin: null, quantity: null, amount: 1530}]},
  ],
};

const rows = toRows([debit('2024-10-04', 250), debit('2024-09-04', 250)], {
  rules: {},
  categories: categoriesFrom([]),
  merges: {},
  labels: {},
  paymentCategories: {},
});

describe('an assurance vie with statements', () => {
  const [account] = savingsAccounts(rows, '2024-12', {}, {}, {'assurance-vie': statement});

  it('counts the payments its statements list before the bank data, and no payment twice', () => {
    expect(account.key).toBe('assurance-vie');
    expect(account.paidIn).toBe(1500);
    expect(account.first).toBe('2024-08-09');
    expect(account.flows.map(flow => flow.date)).toEqual(['2024-10-04', '2024-09-04', '2024-08-09']);
  });

  it('grows from its opening by what it holds beyond what was paid in', () => {
    expect(growthBetween(account, {date: '2024-08-08', value: 0}, {date: '2024-12-31', value: 1530})).toBe(30);
  });

  it('adds up each statement: paid in, fees, interest and what it grew', () => {
    expect(statementYears(statement)).toEqual([
      {label: '2024', paidIn: 1500, fees: 4, interest: 12, value: 1530, grown: 30},
    ]);
  });
});
