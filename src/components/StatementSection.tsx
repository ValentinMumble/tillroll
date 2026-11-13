import {useState} from 'react';
import {money} from '../format';
import {dayLabel} from '../periods';
import type {SavingsStatement, StatementKind, StatementMovement} from '../types';

/** The insurer's lines in plain words. */
const KIND_LABELS: Record<StatementKind, string> = {
  payment: 'Paid in',
  'entry-fee': 'Fee on a payment',
  'management-fee': 'Management fee',
  interest: 'Interest',
  'extra-interest': 'Extra interest',
  'social-charges': 'Social charges',
  distribution: 'Dividends',
  switch: 'Switch between funds',
  withdrawal: 'Taken out',
};

/** Money that adds to the account, takes from it, or only moves between its funds. */
const SIGNS: Record<StatementKind, 1 | -1 | 0> = {
  payment: 1,
  'entry-fee': -1,
  'management-fee': -1,
  interest: 1,
  'extra-interest': 1,
  'social-charges': -1,
  distribution: 1,
  switch: 0,
  withdrawal: -1,
};

/** The funds and the lines listed before "Show all". */
const FUNDS_SHOWN = 6;
const LINES_SHOWN = 12;

/** A line's name: the kind of payment it was when the insurer says, and whether a switch was its own. */
function lineName(movement: StatementMovement) {
  if (movement.kind === 'payment') {
    if (/initial/i.test(movement.label)) return 'First payment';
    if (/programm/i.test(movement.label)) return 'Monthly payment';
    return 'Extra payment';
  }
  if (movement.kind === 'switch' && /automatique/i.test(movement.label)) return 'Automatic switch between funds';
  return KIND_LABELS[movement.kind];
}

/** The year a statement covers, or its span when it ends before the year does ("2026, to 13 Nov"). */
function spanLabel(to: string) {
  const year = to.slice(0, 4);
  return to.endsWith('-12-31') ? year : `${year}, to ${dayLabel(to)}`;
}

/** What the lines of each statement add up to: paid in, fees, interest (net of social charges), and what it grew. */
export function statementYears(statement: SavingsStatement) {
  const values = [...statement.values].sort((first, second) => (first.date < second.date ? -1 : 1));
  return values.slice(1).map((end, index) => {
    const start = values[index];
    const lines = statement.movements.filter(item => item.date > start.date && item.date <= end.date);
    const sum = (kinds: StatementKind[]) =>
      lines.filter(item => kinds.includes(item.kind)).reduce((total, item) => total + item.amount, 0);
    const paidIn = sum(['payment']) - sum(['withdrawal']);
    return {
      label: spanLabel(end.date),
      paidIn,
      fees: sum(['entry-fee', 'management-fee']),
      interest: sum(['interest', 'extra-interest', 'distribution']) - sum(['social-charges']),
      value: end.value,
      grown: end.value - start.value - paidIn,
    };
  });
}

/**
 * An assurance vie as its yearly statements tell it: year by year what was paid in, the fees, the interest and what it
 * grew; the funds it holds at the latest statement; and every line the insurer lists, newest first.
 */
export function StatementSection({statement, currency}: {statement: SavingsStatement; currency: string}) {
  const [allFunds, setAllFunds] = useState(false);
  const [allLines, setAllLines] = useState(false);
  const years = statementYears(statement);
  const latest = [...statement.values].sort((first, second) => (first.date < second.date ? -1 : 1)).at(-1);
  if (!latest || years.length === 0) return null;
  const funds = [...latest.funds].sort((first, second) => second.amount - first.amount);
  const lines = [...statement.movements].sort((first, second) => (first.date < second.date ? 1 : -1));
  const total = (key: 'paidIn' | 'fees' | 'interest' | 'grown') => years.reduce((sum, year) => sum + year[key], 0);
  const signed = (value: number) => `${value >= 0 ? '+' : '−'}${money(Math.abs(value), currency)}`;
  return (
    <section className="statement" aria-labelledby="statement-title">
      <h3 id="statement-title">
        {statement.contract} <span className="hint">from its statements, to {dayLabel(latest.date, true)}</span>
      </h3>
      <div className="statement-table-wrap">
        <table className="statement-years">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Paid in</th>
              <th scope="col">Fees</th>
              <th scope="col">Interest</th>
              <th scope="col">Value at its end</th>
              <th scope="col">Grown</th>
            </tr>
          </thead>
          <tbody>
            {years.map(year => (
              <tr key={year.label}>
                <th scope="row">{year.label}</th>
                <td>{money(year.paidIn, currency)}</td>
                <td>{money(year.fees, currency)}</td>
                <td>{money(year.interest, currency)}</td>
                <td>{money(year.value, currency)}</td>
                <td className={year.grown >= 0 ? 'is-up-good' : 'is-down-bad'}>{signed(year.grown)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">In all</th>
              <td>{money(total('paidIn'), currency)}</td>
              <td>{money(total('fees'), currency)}</td>
              <td>{money(total('interest'), currency)}</td>
              <td>{money(latest.value, currency)}</td>
              <td className={total('grown') >= 0 ? 'is-up-good' : 'is-down-bad'}>{signed(total('grown'))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">
        Interest is the euro fund's, after social charges. Grown is the change in value beyond what was paid in: the
        funds' ups and downs, the interest and the fees together.
      </p>
      <h4>Funds on {dayLabel(latest.date, true)}</h4>
      <ul className="statement-funds">
        {funds.slice(0, allFunds ? undefined : FUNDS_SHOWN).map(fund => (
          <li key={`${fund.name}-${fund.isin}`}>
            <span className="statement-fund-name">{fund.name}</span>
            <span className="statement-share">{Math.round((fund.amount / latest.value) * 100)}%</span>
            <span>{money(fund.amount, currency, true)}</span>
          </li>
        ))}
      </ul>
      {!allFunds && funds.length > FUNDS_SHOWN && (
        <button type="button" className="link-button savings-more" onClick={() => setAllFunds(true)}>
          Show all {funds.length} funds
        </button>
      )}
      <details className="fold">
        <summary>Every line of the statements ({lines.length})</summary>
        <ul className="statement-lines">
          {lines.slice(0, allLines ? undefined : LINES_SHOWN).map((line, index) => (
            <li key={`${line.date}-${line.kind}-${index}`}>
              <span className="statement-line-day">{dayLabel(line.date, true)}</span>
              <span>{lineName(line)}</span>
              <span className={SIGNS[line.kind] > 0 ? 'is-up-good' : undefined}>
                {SIGNS[line.kind] > 0 ? '+' : SIGNS[line.kind] < 0 ? '−' : ''}
                {money(line.amount, currency, true)}
              </span>
            </li>
          ))}
        </ul>
        {!allLines && lines.length > LINES_SHOWN && (
          <button type="button" className="link-button savings-more" onClick={() => setAllLines(true)}>
            Show all {lines.length}
          </button>
        )}
      </details>
    </section>
  );
}
