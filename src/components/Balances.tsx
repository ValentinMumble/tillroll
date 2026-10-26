import {money} from '../format';
import {dayLabel, today} from '../periods';
import {bankBalances} from '../savings';
import type {Balance} from '../types';
import {BankBadge} from './BankBadge';

interface Props {
  /** The bank accounts' balances at their last sync. */
  balances: Balance[];
  currency: string;
  /** The savings view, with the net worth. */
  onSavings: () => void;
}

/**
 * What is in the bank right now: each bank's balance side by side on one row (its accounts together, in whole euros,
 * the cents on hover), and all of them in the header.
 */
export function Balances({balances, currency, onSavings}: Props) {
  const banks = [...bankBalances(balances, currency).values()].sort((first, second) => second.amount - first.amount);
  if (banks.length === 0) return null;
  const total = banks.reduce((sum, balance) => sum + balance.amount, 0);
  const oldest = banks.map(balance => balance.date).sort()[0];
  return (
    <section className="card balances">
      <header className="card-head">
        <h2>Balances</h2>
        <span className="view-total">{money(total, currency, true)}</span>
        <span className="hint">{oldest >= today() ? 'today' : `on ${dayLabel(oldest)}`}</span>
        <button type="button" className="link-button" onClick={onSavings}>
          Savings →
        </button>
      </header>
      <ul className="balance-lines">
        {banks.map(balance => (
          <li key={balance.bank} title={`${balance.bank}: ${money(balance.amount, currency, true)}`}>
            <span className="balance-bank">
              <BankBadge bank={balance.bank} />
              <span>{balance.bank}</span>
            </span>
            <span className={`balance-amount${balance.amount < 0 ? ' is-negative' : ''}`}>
              {money(balance.amount, currency)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
