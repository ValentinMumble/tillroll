import {type ReactNode, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {daysBetween, type Grain, today} from '../periods';
import {type Report, timeAndMoney, waitingForPay} from '../report';
import {Delta} from './Delta';
import {ChartTip} from './ChartTip';
import {PaceCompare} from './PaceCompare';
import {PaceRings} from './PaceRings';

interface Props {
  report: Report;
  grain: Grain;
  currency: string;
  categories: Categories;
  /** What the period put in savings accounts, less what it took back. */
  toSavings: number;
  /** The banks' balances (see Balances), beside the total on a wide screen, at the end on a phone. */
  balances?: ReactNode;
}

/**
 * The receipt's total: what the period kept of what came in, then in one line what it cost against the usual period
 * or the previous one so far; the donut (time against money) with a short key; and a strip of the categories'
 * colours, each as long as its share. The balances fill the space beside them. Under it, the facts the rest does not
 * give: payments with what a day cost, money in, and what went to savings (a few moves early in the month: a number,
 * not a ring). While a period still waits for its pay (or nothing came in), what it kept means nothing yet: the total
 * is what it cost, and a fact gives what was kept. Each figure shows once.
 */
export function Summary({report, grain, currency, categories, toSavings, balances}: Props) {
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
  const showKept = current.moneyIn >= 0.5 && !waitingForPay(report);
  const spentWords = ongoing ? 'Spent so far' : 'Spent';
  const rings = Boolean(pace && timeAndMoney(pace, ongoing, grain, currency).whole);
  // Against the period before, in short ("▼ €1,033 vs last month"): the small chart beside it shows "at this point",
  // the arrow and its colour say less or more, and a screen reader hears the word.
  const comparison =
    baseline &&
    (Math.abs(current.total - baseline.total) < 1 ? (
      `The same as ${baseline.short}`
    ) : (
      <>
        <Delta value={current.total - baseline.total} currency={currency} compact />
        <span className="visually-hidden">{current.total > baseline.total ? ' more' : ' less'}</span> vs{' '}
        {baseline.short}
      </>
    ));
  // This period's spending day by day against the one before's, small beside the large number.
  const compare = ongoing && pace && (
    <PaceCompare
      pace={pace}
      currency={currency}
      word={grain === 'week' ? 'week' : grain === 'year' ? 'year' : 'month'}
    />
  );
  return (
    <div className="summary">
      <div className="summary-main">
        {showKept ? (
          <>
            {/* The period is in the bar above: the eyebrow only says what the number is. */}
            <p className="eyebrow">{kept < 0 ? 'Spent beyond money in' : ongoing ? 'Kept so far' : 'Kept'}</p>
            {/* The number and what was spent on two lines on the left; the small chart beside them, as tall. */}
            <div className="summary-top">
              <div className="summary-figures">
                <p className="hero">
                  {kept < 0 && '−'}
                  {money(Math.abs(kept), currency)}
                </p>
                <p className="summary-delta">
                  {/* The amount first, like the line under it. */}
                  <span>
                    <strong>{money(current.total, currency)}</strong> {spentWords.toLowerCase()}
                  </span>
                  {comparison && <span>{comparison}</span>}
                </p>
              </div>
              {compare}
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">{spentWords}</p>
            <div className="summary-top">
              <div className="summary-figures">
                <p className="hero">{money(current.total, currency)}</p>
                {comparison && (
                  <p className="summary-delta">
                    <span>{comparison}</span>
                  </p>
                )}
              </div>
              {compare}
            </div>
          </>
        )}
        {/* The rings' key counts the days: this line only when there are no rings. */}
        {ongoing && pace && !rings && (
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
          <dt>Money in</dt>
          <dd>{money(current.moneyIn, currency)}</dd>
        </div>
        {/* What was kept, while the total is what was spent (waiting for the pay): otherwise it is the total. */}
        {!showKept && (
          <div className="fact-kept">
            <dt>{kept < 0 ? 'Spent beyond money in' : 'Kept'}</dt>
            <dd>
              {money(Math.abs(kept), currency)}
              {kept > 0 && <span className="muted"> · {Math.round((kept / current.moneyIn) * 100)}%</span>}
            </dd>
          </div>
        )}
        <div>
          <dt>{toSavings < 0 ? 'Taken from savings' : 'To savings'}</dt>
          <dd>{money(Math.abs(toSavings), currency)}</dd>
        </div>
        {/* Last: the money first, then how many payments it took. */}
        <div>
          <dt>Payments</dt>
          <dd>
            {current.payments}
            <span className="muted"> · {money(current.total / days, currency)} a day</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
