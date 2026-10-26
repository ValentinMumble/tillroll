import {useState} from 'react';
import {BANK_NAMES} from '../banks';
import {money, parseAmount} from '../format';
import {dayLabel, periodEnd, periodLabel, shiftPeriod, shortMonth, today} from '../periods';
import type {Row} from '../report';
import {
  addedAccountKey,
  balanceOn,
  bankBalances,
  estimateNow,
  growthBetween,
  type SavingsAccount,
  savingsAccounts,
  valueOn,
} from '../savings';
import type {Balance, SavingsRecord, SavingsValue, SavingsValues} from '../types';
import {BankBadge} from './BankBadge';
import {BarStrip} from './BarStrip';

interface Props {
  /** The payments of one currency, newest first. */
  rows: Row[];
  currency: string;
  values: SavingsValues;
  /** The account holders each bank names, as the bank connections give them. */
  holders: Record<string, string[]>;
  /** The bank accounts' balances at their last sync, for the net worth. */
  balances: Balance[];
  /** An account's values typed by hand, all of them, or an account added by hand; null takes it off. */
  onSave: (account: string, record: SavingsRecord | null) => void;
}

/** The values typed for an account, oldest first. */
const byDate = (values: SavingsValue[]) => [...values].sort((first, second) => (first.date < second.date ? -1 : 1));

/** Its bank: the one the money moved from, or the one its name says for an account added by hand. */
const bankOf = (account: SavingsAccount) =>
  account.bank ?? BANK_NAMES.find(bank => account.name.toLowerCase().includes(bank.toLowerCase())) ?? null;

/** One account: what went in and out, month by month, and its value when typed by hand, with its growth. */
function AccountCard({
  account,
  currency,
  values,
  onValues,
  onRemove,
}: {
  account: SavingsAccount;
  currency: string;
  values: SavingsValue[];
  onValues: (values: SavingsValue[]) => void;
  /** An account added by hand can be taken off. */
  onRemove?: () => void;
}) {
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const months = account.months.slice(-24);
  const years = new Map<string, number>();
  for (const month of account.months) {
    years.set(month.month.slice(0, 4), (years.get(month.month.slice(0, 4)) ?? 0) + month.paidIn - month.takenOut);
  }
  const sorted = byDate(values);
  const latest = sorted[sorted.length - 1];
  const growth = sorted.length > 1 ? growthBetween(account, sorted[0], latest) : null;
  const estimate = latest ? estimateNow(account, latest) : null;
  const bank = bankOf(account);
  const paidIn =
    account.first &&
    `paid in since ${dayLabel(account.first, true)}, from the payments Tillroll has` +
      (account.takenOut > 0
        ? ` (${money(account.paidIn, currency)} in, ${money(account.takenOut, currency)} taken out)`
        : '');

  function add() {
    const amount = parseAmount(value);
    if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onValues([...sorted.filter(item => item.date !== date), {date, value: amount}]);
    setValue('');
  }

  return (
    <section className="card savings-card">
      <header className="card-head">
        <h2>
          {bank && <BankBadge bank={bank} />}
          {account.name}
        </h2>
        {latest && estimate ? (
          <>
            <span className="view-total">{money(estimate.value, currency, true)}</span>
            <span className="hint">
              {estimate.isEstimate
                ? `estimate: ${money(latest.value, currency, true)} on ${dayLabel(latest.date, true)}, ` +
                  (estimate.moved > 0
                    ? `plus ${money(estimate.moved, currency, true)} paid in since`
                    : `less ${money(-estimate.moved, currency, true)} taken out since`)
                : `on ${dayLabel(latest.date, true)}`}
            </span>
          </>
        ) : paidIn ? (
          <>
            <span className="view-total">{money(account.paidIn - account.takenOut, currency)}</span>
            <span className="hint">{paidIn}</span>
          </>
        ) : (
          <span className="hint">added by hand: no payment shows money moved to it</span>
        )}
        {onRemove && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              if (window.confirm(`Take ${account.name} off, with its values?`)) onRemove();
            }}
          >
            Remove
          </button>
        )}
      </header>
      {latest && paidIn && (
        <p className="hint savings-paid">
          {money(account.paidIn - account.takenOut, currency)} {paidIn}
        </p>
      )}
      {months.length > 1 && (
        <BarStrip
          caption="Paid in, month by month"
          values={months.map(month => Math.max(0, month.paidIn))}
          // Every third month, counted back from the last one, so the last label never runs into another.
          labels={months.map((month, index) => ((months.length - 1 - index) % 3 === 0 ? shortMonth(month.month) : ''))}
          titles={months.map(month => periodLabel(month.month, 'month'))}
          currency={currency}
        />
      )}
      {years.size > 0 && (
        <p className="savings-years">
          {[...years]
            .sort((first, second) => (first[0] < second[0] ? -1 : 1))
            .map(([year, total]) => (
              <span key={year}>
                {year} <strong>{money(total, currency)}</strong>
              </span>
            ))}
        </p>
      )}
      <div className="savings-value">
        {growth !== null ? (
          <p>
            <span className={growth >= 0 ? 'is-up-good' : 'is-down-bad'}>
              {growth >= 0 ? '+' : '−'}
              {money(Math.abs(growth), currency, true)}
            </span>{' '}
            grown since {dayLabel(sorted[0].date, true)}, beyond what you paid in
          </p>
        ) : (
          <p className="muted">
            {latest
              ? 'Add an older value too, from a yearly statement: Tillroll then shows how much it grew, beyond what you paid in.'
              : 'Type its value now and then, from its app or its yearly statement: Tillroll then shows how much it grew, beyond what you paid in.'}
          </p>
        )}
        <form
          className="savings-form"
          onSubmit={event => {
            event.preventDefault();
            add();
          }}
        >
          <input
            className="text-input"
            type="date"
            aria-label={`Day of the value of ${account.name}`}
            value={date}
            max={today()}
            onChange={event => setDate(event.target.value)}
          />
          <input
            className="text-input"
            inputMode="decimal"
            aria-label={`Value of ${account.name}`}
            placeholder={`Value, ${currency}`}
            value={value}
            onChange={event => setValue(event.target.value)}
          />
          <button type="submit" className="button" disabled={!value.trim()}>
            Add
          </button>
        </form>
        {sorted.length > 0 && (
          <ul className="savings-values">
            {[...sorted].reverse().map(item => (
              <li key={item.date}>
                <span>{dayLabel(item.date, true)}</span>
                <span>{money(item.value, currency, true)}</span>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Take off the value of ${dayLabel(item.date, true)}`}
                  onClick={() => onValues(sorted.filter(other => other.date !== item.date))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Savings: each account money is put aside in (an assurance vie, a livret, Revolut's savings), what went in and out
 * month by month and year by year, and its value when typed by hand, with how much it grew beyond what was paid in.
 */
export function Savings({rows, currency, values, holders, balances, onSave}: Props) {
  const accounts = savingsAccounts(rows, today().slice(0, 7), values, holders);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  // The total: each account's value now, estimated from its latest value typed. One with no value yet is left out,
  // and named.
  const latest = accounts.map(account => {
    const typed = byDate(values[account.key]?.values ?? []).at(-1);
    return {account, typed, estimate: typed ? estimateNow(account, typed) : null};
  });
  const valued = latest.filter(item => item.estimate !== null);
  const missing = latest.filter(item => item.estimate === null).map(item => item.account.name);
  const total = valued.reduce((sum, item) => sum + (item.estimate?.value ?? 0), 0);
  const estimated = valued.some(item => item.estimate?.isEstimate);
  const newest = valued
    .map(item => item.typed?.date ?? '')
    .sort()
    .at(-1);

  // The net worth: each bank's balance in this currency (see bankBalances), and the savings.
  const banks = bankBalances(balances, currency);
  const worthOn = (date: string) =>
    [...banks.values()].reduce((sum, balance) => sum + balanceOn(balance, rows, date), 0) +
    accounts.reduce((sum, account) => sum + (valueOn(account, values[account.key]?.values ?? [], date) ?? 0), 0);
  // At each month's end, from the first payment, over two years at most; this month's is today's.
  const thisMonth = today().slice(0, 7);
  const firstMonth = rows.at(-1)?.date.slice(0, 7) ?? thisMonth;
  const worthMonths: string[] = [];
  for (let month = thisMonth; month >= firstMonth && worthMonths.length < 24; month = shiftPeriod(month, 'month', -1)) {
    worthMonths.unshift(month);
  }
  const history =
    banks.size > 0 ? worthMonths.map(month => worthOn(month === thisMonth ? today() : periodEnd(month, 'month'))) : [];
  const bankTotal = [...banks.values()].reduce((sum, balance) => sum + balance.amount, 0);

  function addAccount() {
    const amount = parseAmount(value);
    if (!name.trim()) return;
    const key = addedAccountKey(name.trim(), Object.keys(values));
    onSave(key, {name: name.trim(), values: amount === null ? [] : [{date: today(), value: amount}]});
    setName('');
    setValue('');
  }

  return (
    <div className="savings">
      {banks.size > 0 && (
        <section className="card savings-total net-worth">
          <header className="card-head">
            <h2>Net worth</h2>
            <span className="view-total">{money(bankTotal + total, currency, true)}</span>
            <span className="hint">bank accounts and savings{estimated ? ', savings estimated' : ''}</span>
          </header>
          <p className="savings-years">
            {[...banks.values()].map(balance => (
              <span key={balance.bank} title={`Balance on ${dayLabel(balance.date, true)}`}>
                <BankBadge bank={balance.bank} />
                {balance.bank} <strong>{money(balance.amount, currency, true)}</strong>
              </span>
            ))}
            <span>
              Savings <strong>{money(total, currency, true)}</strong>
            </span>
          </p>
          {history.length > 1 && (
            <BarStrip
              caption="At each month's end, worked out from today's balances and the payments since"
              values={history.map(worth => Math.max(0, worth))}
              // Every third month, counted back from the last one, so the last label never runs into another.
              labels={worthMonths.map((month, index) =>
                (worthMonths.length - 1 - index) % 3 === 0 ? shortMonth(month) : '',
              )}
              titles={worthMonths.map(month => periodLabel(month, 'month'))}
              currency={currency}
            />
          )}
        </section>
      )}
      {valued.length > 0 && (
        <section className="card savings-total">
          <header className="card-head">
            <h2>Total savings</h2>
            <span className="view-total">{money(total, currency, true)}</span>
            {estimated ? (
              <span className="hint">estimate: the values typed, plus the payments since (≈)</span>
            ) : (
              newest && <span className="hint">latest value on {dayLabel(newest, true)}</span>
            )}
          </header>
          <p className="savings-years">
            {valued.map(({account, estimate}) => {
              const bank = bankOf(account);
              return (
                <span key={account.key}>
                  {bank && <BankBadge bank={bank} />}
                  {account.name}{' '}
                  <strong>
                    {estimate?.isEstimate && '≈ '}
                    {money(estimate?.value ?? 0, currency, true)}
                  </strong>
                </span>
              );
            })}
          </p>
          {missing.length > 0 && (
            <p className="hint">Left out, with no value typed yet: {missing.join(', ')}. Type one in its card below.</p>
          )}
        </section>
      )}
      {accounts.length === 0 && (
        <section className="card">
          <h2>Savings</h2>
          <p className="empty">
            No savings found: money moved to an assurance vie, a livret or Revolut's savings shows here. An account no
            payment shows can be added below.
          </p>
        </section>
      )}
      {accounts.map(account => (
        <AccountCard
          key={account.key}
          account={account}
          currency={currency}
          values={values[account.key]?.values ?? []}
          onValues={list =>
            onSave(
              account.key,
              account.added ? {name: account.name, values: list} : list.length ? {values: list} : null,
            )
          }
          onRemove={account.added ? () => onSave(account.key, null) : undefined}
        />
      ))}
      <section className="card">
        <h2>Add an account</h2>
        <p className="hint">
          One no payment shows, like a livret at another bank: its name and its value today. Payments that name it count
          as money paid in.
        </p>
        <form
          className="savings-form"
          onSubmit={event => {
            event.preventDefault();
            addAccount();
          }}
        >
          <input
            className="text-input"
            aria-label="Name of the account"
            placeholder="Livret La Nef"
            value={name}
            maxLength={60}
            onChange={event => setName(event.target.value)}
          />
          <input
            className="text-input"
            inputMode="decimal"
            aria-label="Its value today"
            placeholder={`Value today, ${currency}`}
            value={value}
            onChange={event => setValue(event.target.value)}
          />
          <button type="submit" className="button" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
