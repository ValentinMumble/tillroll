import type {ReactNode} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {daysBetween, type Grain, periodLabel, today} from '../periods';
import type {Report} from '../report';
import {Delta} from './Delta';
import {PaceRings} from './PaceRings';

interface Props {
  report: Report;
  period: string;
  grain: Grain;
  currency: string;
  categories: Categories;
  /** The banks' balances (see Balances), beside the total on a wide screen, at the end on a phone. */
  balances?: ReactNode;
}

/**
 * The receipt's total: what the period cost, against the usual period or the previous one so far, how far into the
 * period it is, time against money as two rings, and a strip of the categories' colours, each as long as its share.
 * The balances fill the space beside them.
 */
export function Summary({report, period, grain, currency, categories, balances}: Props) {
  const {current, baseline, ongoing} = report;
  const parts = [...current.categories]
    .filter(([, value]) => value >= 0.5)
    .sort((first, second) => second[1] - first[1]);
  const labelOf = (key: string) => categories.byKey[key]?.label ?? key;
  const days = daysBetween(report.from, ongoing ? today() : report.to);
  const pace = report.pace;
  const left = pace ? pace.days - pace.spent.length : 0;
  return (
    <div className="summary">
      <div className="summary-main">
        <p className="eyebrow">
          {ongoing ? 'Spent so far' : 'Spent'} · {periodLabel(period, grain)}
        </p>
        <p className="hero">{money(current.total, currency)}</p>
        {baseline && (
          <p className="summary-delta">
            {Math.abs(current.total - baseline.total) < 1 ? (
              `The same as ${baseline.label}`
            ) : (
              <>
                <Delta value={current.total - baseline.total} currency={currency} /> than {baseline.label}
                <span className="muted"> ({money(baseline.total, currency)})</span>
              </>
            )}
          </p>
        )}
        {ongoing && pace && (
          <p className="summary-pace">
            Day {pace.spent.length} of {pace.days} ·{' '}
            {left === 0 ? 'the last day' : left === 1 ? '1 day left' : `${left} days left`}
          </p>
        )}
        {pace && <PaceRings pace={pace} ongoing={ongoing} grain={grain} currency={currency} />}
      </div>
      {balances}
      {parts.length > 0 && (
        <div
          className="spend-strip"
          role="img"
          aria-label={`Spending by category, biggest first: ${parts.map(([key]) => labelOf(key)).join(', ')}`}
        >
          {parts.map(([key, value]) => (
            <span
              key={key}
              title={`${labelOf(key)}: ${money(value, currency)}`}
              style={{...colourStyle(categories.colours[key]), flexGrow: value}}
            >
              {/* Shown only when the part is wide enough for it (see .spend-strip-icon). */}
              <span className="spend-strip-icon" aria-hidden="true">
                {categories.byKey[key]?.icon}
              </span>
            </span>
          ))}
        </div>
      )}
      <dl className="facts">
        <div>
          <dt>Payments</dt>
          <dd>{current.payments}</dd>
        </div>
        <div>
          <dt>Per day</dt>
          <dd>{money(current.total / days, currency)}</dd>
        </div>
        <div>
          <dt>Moved out, not spent</dt>
          <dd>{money(current.movedOut, currency)}</dd>
        </div>
        <div>
          <dt>Money in</dt>
          <dd>{money(current.moneyIn, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
