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
 * What is in the bank right now, in the receipt beside its total (at its end on a phone): all of it, then each bank's
 * balance (its accounts together, in whole euros, the cents on hover), and the way to the savings.
 */
export function Balances({balances, currency, onSavings}: Props) {
  const banks = [...bankBalances(balances, currency).values()].sort((first, second) => second.amount - first.amount);
  if (banks.length === 0) return null;
  const total = banks.reduce((sum, balance) => sum + balance.amount, 0);
  const oldest = banks.map(balance => balance.date).sort()[0];
  return (
    <section className="receipt-balances" aria-labelledby="balances-title">
      <p className="eyebrow" id="balances-title">
        Balances · {oldest >= today() ? 'today' : `on ${dayLabel(oldest)}`}
      </p>
      <p className="balances-total">{money(total, currency, true)}</p>
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
      <button type="button" className="link-button balances-savings" onClick={onSavings}>
        Savings →
      </button>
    </section>
  );
}
