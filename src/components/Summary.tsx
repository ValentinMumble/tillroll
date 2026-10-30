import {type ReactNode, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {daysBetween, type Grain, periodLabel, today} from '../periods';
import type {Report} from '../report';
import {Delta} from './Delta';
import {ChartTip} from './ChartTip';
import {PaceRings} from './PaceRings';

interface Props {
  report: Report;
  period: string;
  grain: Grain;
  currency: string;
  categories: Categories;
  /** What the period put in savings accounts, less what it took back. */
  toSavings: number;
  /** The banks' balances (see Balances), beside the total on a wide screen, at the end on a phone. */
  balances?: ReactNode;
}

/**
 * The receipt's total: what the period cost, against the usual period or the previous one so far, how far into the
 * period it is, time against money as two rings, and a strip of the categories' colours, each as long as its share.
 * The balances fill the space beside them. Under it, four facts: payments with what a day cost, money in, what was kept
 * of it (its share), and what went to savings.
 */
export function Summary({report, period, grain, currency, categories, toSavings, balances}: Props) {
  const {current, baseline, ongoing} = report;
  const parts = [...current.categories]
    .filter(([, value]) => value >= 0.5)
    .sort((first, second) => second[1] - first[1]);
  const labelOf = (key: string) => categories.byKey[key]?.label ?? key;
  // The part under the pointer (or tapped), with a tooltip like the month chart's above its middle.
  const [hovered, setHovered] = useState<string | null>(null);
  const stripTotal = parts.reduce((sum, [, value]) => sum + value, 0);
  const middles = new Map<string, number>();
  parts.reduce((before, [key, value]) => {
    middles.set(key, ((before + value / 2) / stripTotal) * 100);
    return before + value;
  }, 0);
  const tipValue = hovered ? (current.categories.get(hovered) ?? 0) : 0;
  const tipMiddle = hovered ? (middles.get(hovered) ?? 50) : 50;
  const days = daysBetween(report.from, ongoing ? today() : report.to);
  const pace = report.pace;
  const left = pace ? pace.days - pace.spent.length : 0;
  // What the period kept of what came in (Money in and out's figure), or spent beyond it.
  const kept = current.moneyIn - current.total;
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
        <div className="spend-strip-wrap">
          <div
            className="spend-strip"
            role="img"
            aria-label={`Spending by category, biggest first: ${parts.map(([key]) => labelOf(key)).join(', ')}`}
            onPointerLeave={() => setHovered(null)}
          >
            {parts.map(([key, value]) => (
              <span
                key={key}
                style={{...colourStyle(categories.colours[key]), flexGrow: value}}
                onPointerEnter={event => {
                  if (event.pointerType === 'mouse') setHovered(key);
                }}
                // A tap shows it on a phone, and hides it again.
                onClick={() => setHovered(shown => (shown === key ? null : key))}
              >
                {/* Shown only when the part is wide enough for it (see .spend-strip-icon). */}
                <span className="spend-strip-icon" aria-hidden="true">
                  {categories.byKey[key]?.icon}
                </span>
              </span>
            ))}
          </div>
          {hovered && (
            <ChartTip
              className="spend-tip"
              edge={tipMiddle < 12 ? 'start' : tipMiddle > 88 ? 'end' : null}
              left={`${tipMiddle}%`}
            >
              <strong>
                {categories.byKey[hovered]?.icon} {labelOf(hovered)}
              </strong>
              <span>
                {money(tipValue, currency)} · {Math.round((tipValue / stripTotal) * 100)}% of the spending
              </span>
            </ChartTip>
          )}
        </div>
      )}
      <dl className="facts">
        <div>
          <dt>Payments</dt>
          <dd>
            {current.payments}
            <span className="muted"> · {money(current.total / days, currency)} a day</span>
          </dd>
        </div>
        <div>
          <dt>Money in</dt>
          <dd>{money(current.moneyIn, currency)}</dd>
        </div>
        <div className="fact-kept">
          <dt>{kept < 0 ? 'Spent beyond money in' : 'Kept'}</dt>
          <dd>
            {money(Math.abs(kept), currency)}
            {kept > 0 && <span className="muted"> · {Math.round((kept / current.moneyIn) * 100)}%</span>}
          </dd>
        </div>
        <div>
          <dt>{toSavings < 0 ? 'Taken from savings' : 'To savings'}</dt>
          <dd>{money(Math.abs(toSavings), currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
