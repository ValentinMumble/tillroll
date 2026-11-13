import {useState} from 'react';
import {BANK_NAMES} from '../banks';
import {money, parseAmount} from '../format';
import {addDays, dayLabel, periodEnd, periodLabel, shiftPeriod, shortMonth, today} from '../periods';
import type {Row} from '../rows';
import {
  addedAccountKey,
  balanceOn,
  bankBalances,
  byBank,
  estimateNow,
  growthBetween,
  type SavingsAccount,
  savingsAccounts,
  valueOn,
} from '../savings';
import type {Balance, SavingsRecord, SavingsStatement, SavingsStatements, SavingsValue, SavingsValues} from '../types';
import {BankBadge} from './BankBadge';
import {BarStrip} from './BarStrip';
import {PutAside} from './PutAside';
import {StatementSection} from './StatementSection';
import {ValueChart} from './ValueChart';

interface Props {
  /** The payments of one currency, newest first. */
  rows: Row[];
  currency: string;
  values: SavingsValues;
  /** An assurance vie's statements read from their PDFs, by account. */
  statements: SavingsStatements;
  /** The account holders each bank names, as the bank connections give them. */
  holders: Record<string, string[]>;
  /** The bank accounts' balances at their last sync, for the net worth. */
  balances: Balance[];
  /** An account's values typed by hand, all of them, or an account added by hand; null takes it off. */
  onSave: (account: string, record: SavingsRecord | null) => void;
  /** How far back the "put aside" chart goes, shared with the overview's charts (see ChartSpan). */
  chartSpan: number;
  onChartSpan: (span: number) => void;
}

/** An account lists this many of its latest values; the rest on request. */
const VALUES_SHOWN = 6;

/** The values typed for an account, oldest first. */
const byDate = (values: SavingsValue[]) => [...values].sort((first, second) => (first.date < second.date ? -1 : 1));

/** An account's values: the ones typed, and its statements' (a value typed on the same day wins), oldest first. */
function knownValues(typed: SavingsValue[], statement?: SavingsStatement) {
  const fromStatements = (statement?.values ?? [])
    .filter(item => item.value > 0 && !typed.some(other => other.date === item.date))
    .map(item => ({date: item.date, value: item.value}));
  return byDate([...typed, ...fromStatements]);
}

/** Its bank: the one the money moved from, or the one its name says for an account added by hand. */
const bankOf = (account: SavingsAccount) =>
  account.bank ?? BANK_NAMES.find(bank => account.name.toLowerCase().includes(bank.toLowerCase())) ?? null;

/**
 * One account: its value now, what it grew beyond what was paid in, what was paid in year by year, its value over
 * time, what its statements tell (an assurance vie's), and the values typed by hand, folded.
 */
function AccountCard({
  account,
  currency,
  values,
  statement,
  onValues,
  onRemove,
}: {
  account: SavingsAccount;
  currency: string;
  values: SavingsValue[];
  statement?: SavingsStatement;
  onValues: (values: SavingsValue[]) => void;
  /** An account added by hand can be taken off. */
  onRemove?: () => void;
}) {
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [allValues, setAllValues] = useState(false);
  const years = new Map<string, number>();
  for (const month of account.months) {
    years.set(month.month.slice(0, 4), (years.get(month.month.slice(0, 4)) ?? 0) + month.paidIn - month.takenOut);
  }
  // The values typed, and its statements': the chart and the growth use both.
  const typed = byDate(values);
  const sorted = knownValues(typed, statement);
  const latest = sorted[sorted.length - 1];
  // Statements that start at nothing saw the account open: what it grew counts from its first payment.
  const opened = statement?.values.some(item => item.value === 0) && account.first ? account.first : null;
  const since = opened ? {date: addDays(opened, -1), value: 0} : sorted[0];
  const growth = latest && (opened || sorted.length > 1) ? growthBetween(account, since, latest) : null;
  const estimate = latest ? estimateNow(account, latest) : null;
  const bank = bankOf(account);
  const paidIn =
    account.first &&
    `paid in since ${dayLabel(account.first, true)}` +
      (account.takenOut > 0
        ? ` (${money(account.paidIn, currency)} in, ${money(account.takenOut, currency)} taken out)`
        : '');

  function add() {
    const amount = parseAmount(value);
    if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onValues([...typed.filter(item => item.date !== date), {date, value: amount}]);
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
      {growth !== null && (
        <p className="savings-growth">
          <span className={growth >= 0 ? 'is-up-good' : 'is-down-bad'}>
            {growth >= 0 ? '+' : '−'}
            {money(Math.abs(growth), currency, true)}
          </span>{' '}
          grown since {dayLabel(opened ?? since.date, true)}, beyond what you paid in
        </p>
      )}
      {/* What was paid in, in all then year by year: the months are in Put aside. */}
      {latest && paidIn && (
        <p className="savings-years">
          <span>
            <strong>{money(account.paidIn - account.takenOut, currency)}</strong> {paidIn}
          </span>
          {[...years]
            .sort((first, second) => (first[0] < second[0] ? -1 : 1))
            .map(([year, total]) => (
              <span key={year}>
                {year} <strong>{money(total, currency)}</strong>
              </span>
            ))}
        </p>
      )}
      <ValueChart values={sorted} currency={currency} />
      {statement && <StatementSection statement={statement} currency={currency} />}
      {/* The values typed by hand, folded once there are some: open while there is none to type the first. */}
      <details className="fold savings-value" open={typed.length === 0}>
        <summary>{typed.length ? `Values typed (${typed.length})` : 'Type its value'}</summary>
        {growth === null && (
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
        {typed.length > 0 && (
          <ul className="savings-values">
            {/* The latest values, newest first; the rest on request. */}
            {[...typed]
              .reverse()
              .slice(0, allValues ? undefined : VALUES_SHOWN)
              .map(item => (
                <li key={item.date}>
                  <span>{dayLabel(item.date, true)}</span>
                  <span>{money(item.value, currency, true)}</span>
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Take off the value of ${dayLabel(item.date, true)}`}
                    onClick={() => onValues(typed.filter(other => other.date !== item.date))}
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
        {!allValues && typed.length > VALUES_SHOWN && (
          <button type="button" className="link-button savings-more" onClick={() => setAllValues(true)}>
            Show all {typed.length}
          </button>
        )}
      </details>
    </section>
  );
}

/**
 * Savings: each account money is put aside in (an assurance vie, a livret, Revolut's savings), what went in and out
 * month by month and year by year, and its value when typed by hand, with how much it grew beyond what was paid in.
 */
export function Savings({
  rows,
  currency,
  values,
  statements,
  holders,
  balances,
  onSave,
  chartSpan,
  onChartSpan,
}: Props) {
  const accounts = savingsAccounts(rows, today().slice(0, 7), values, holders, statements);
  const known = (account: SavingsAccount) => knownValues(values[account.key]?.values ?? [], statements[account.key]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  // The total: each account's value now, estimated from its latest value typed. One with no value yet is left out,
  // and named.
  // An account emptied (its value now under €1, its last move money taken out) is closed: it leaves the total's list
  // and has no card, but its past stays in the net worth's months and in what was put aside.
  const latest = accounts
    .map(account => {
      const typed = known(account).at(-1);
      return {account, typed, estimate: typed ? estimateNow(account, typed) : null};
    })
    .filter(
      ({account, estimate}) => !(estimate && Math.abs(estimate.value) < 1 && (account.flows[0]?.amount ?? 0) > 0),
    );
  const open = latest.map(item => item.account);
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
    accounts.reduce((sum, account) => sum + (valueOn(account, known(account), date) ?? 0), 0);
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
      {/* One card for what you have: each bank, then each savings account (≈ when estimated), and the total. */}
      {(banks.size > 0 || valued.length > 0) && (
        <section className="card savings-total net-worth">
          <header className="card-head">
            <h2>{banks.size > 0 ? 'Net worth' : 'Total savings'}</h2>
            <span className="view-total">{money(bankTotal + total, currency, true)}</span>
            <span className="hint">
              {banks.size > 0 && `${money(bankTotal, currency)} in the bank, `}
              {money(total, currency)} in savings
              {estimated
                ? ', estimated from the values typed and the payments since (≈)'
                : newest
                  ? `, latest value on ${dayLabel(newest, true)}`
                  : ''}
            </span>
          </header>
          <p className="savings-years">
            {[...banks.values()].sort(byBank).map(balance => (
              <span key={balance.bank} title={`Balance on ${dayLabel(balance.date, true)}`}>
                <BankBadge bank={balance.bank} />
                {balance.bank} <strong>{money(balance.amount, currency, true)}</strong>
              </span>
            ))}
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
      <PutAside accounts={accounts} thisMonth={thisMonth} currency={currency} span={chartSpan} onSpan={onChartSpan} />
      {accounts.length === 0 && (
        <section className="card">
          <h2>Savings</h2>
          <p className="empty">
            No savings found: money moved to an assurance vie, a livret or Revolut's savings shows here. An account no
            payment shows can be added below.
          </p>
        </section>
      )}
      {open.map(account => (
        <AccountCard
          key={account.key}
          account={account}
          currency={currency}
          values={values[account.key]?.values ?? []}
          statement={statements[account.key]}
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
