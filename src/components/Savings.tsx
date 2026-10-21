import {useState} from 'react';
import {money} from '../format';
import {dayLabel, periodLabel, shortMonth, today} from '../periods';
import type {Row} from '../report';
import {addedAccountKey, growthBetween, type SavingsAccount, savingsAccounts} from '../savings';
import type {SavingsRecord, SavingsValue, SavingsValues} from '../types';
import {BarStrip} from './BarStrip';

interface Props {
  /** The payments of one currency, newest first. */
  rows: Row[];
  currency: string;
  values: SavingsValues;
  /** An account's values typed by hand, all of them, or an account added by hand; null takes it off. */
  onSave: (account: string, record: SavingsRecord | null) => void;
}

/** "1 913,37", "1913.37" or "1,913.37": a typed amount. */
function parseAmount(text: string) {
  const value = text.replace(/[\s  €]/g, '');
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  const normal = lastComma > lastDot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  return normal && /^-?\d*\.?\d+$/.test(normal) ? Number(normal) : null;
}

/** One account: what went in and out, month by month, and its value when typed by hand, with its growth. */
function AccountCard({
  account,
  rows,
  currency,
  values,
  onValues,
  onRemove,
}: {
  account: SavingsAccount;
  rows: Row[];
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
  const sorted = [...values].sort((first, second) => (first.date < second.date ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  const growth = sorted.length > 1 ? growthBetween(account, sorted[0], latest, rows) : null;

  function add() {
    const amount = parseAmount(value);
    if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onValues([...sorted.filter(item => item.date !== date), {date, value: amount}]);
    setValue('');
  }

  return (
    <section className="card savings-card">
      <header className="card-head">
        <h2>{account.name}</h2>
        {account.first ? (
          <>
            <span className="view-total">{money(account.paidIn - account.takenOut, currency)}</span>
            <span className="hint">
              paid in since {dayLabel(account.first, true)}
              {account.takenOut > 0 &&
                ` (${money(account.paidIn, currency)} in, ${money(account.takenOut, currency)} taken out)`}
            </span>
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
        {latest ? (
          <p>
            Worth <strong>{money(latest.value, currency, true)}</strong> on {dayLabel(latest.date, true)}
            {growth !== null && (
              <>
                {' · '}
                <span className={growth >= 0 ? 'is-up-good' : 'is-down-bad'}>
                  {growth >= 0 ? '+' : '−'}
                  {money(Math.abs(growth), currency, true)}
                </span>{' '}
                grown since {dayLabel(sorted[0].date, true)}, beyond what you paid in
              </>
            )}
          </p>
        ) : (
          <p className="muted">
            Type its value now and then, from its app or its yearly statement: Tillroll then shows how much it grew,
            beyond what you paid in.
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
export function Savings({rows, currency, values, onSave}: Props) {
  const accounts = savingsAccounts(rows, today().slice(0, 7), values);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

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
          rows={rows}
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
