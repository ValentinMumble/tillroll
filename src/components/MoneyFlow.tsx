import {useState} from 'react';
import {money} from '../format';
import {compactPeriodLabel, type Grain, periodLabel} from '../periods';
import {type Report, rollingAverage, trendOf} from '../report';
import {ChartSpan} from './ChartSpan';
import {ChartTip} from './ChartTip';
import {TrendLine} from './TrendLine';

interface Props {
  report: Report;
  grain: Grain;
  currency: string;
  /** What the period put in savings accounts, less what it took back. */
  toSavings: number;
  /** How far back its columns go, shared with the month chart (see ChartSpan). */
  span: number;
  onSpan: (span: number) => void;
}

/**
 * Money in and out: what came in (pay, money from others; not refunds or moves between one's own accounts), what was
 * spent, and what was kept, with its share of what came in. Under it, what each of the chart's periods kept: a bar up,
 * or down when the period spent more than came in; then the pay in each of them, with its trend.
 */
export function MoneyFlow({report, grain, currency, toSavings, span, onSpan}: Props) {
  // The kept and pay columns under the pointer (or tapped), with a tooltip like the month chart's.
  const [hoveredKept, setHoveredKept] = useState<number | null>(null);
  const [hoveredPay, setHoveredPay] = useState<number | null>(null);
  const {moneyIn, total: spent} = report.current;
  const columns = report.series.map(item => ({...item, kept: item.moneyIn - item.total}));
  if (grain === 'week' || columns.every(item => item.moneyIn < 0.5)) return null;
  const kept = moneyIn - spent;
  const top = Math.max(1, ...columns.map(item => Math.abs(item.kept)));
  // What usually comes in (the middle of the last three full periods): a period still going that has not had half
  // of it yet is waiting for its pay, not spending beyond it.
  const full = columns
    .filter(item => !item.partial)
    .slice(-3)
    .map(item => item.moneyIn)
    .sort((first, second) => first - second);
  const usualIn = full.length > 0 ? full[full.length >> 1] : 0;
  const waiting = report.ongoing && usualIn >= 1 && moneyIn < usualIn / 2;
  const words = grain === 'year' ? 'this year' : grain === 'all' ? 'over all time' : 'this month';
  // Pay in each period, under the same columns: its trend over the full periods from the first one paid.
  const firstPaid = columns.findIndex(item => item.pay >= 0.5);
  const paid = columns.map((item, index) => (firstPaid < 0 || index < firstPaid || item.partial ? null : item.pay));
  const payTrend = trendOf(paid);
  const payTop = Math.max(1, ...columns.map(item => item.pay));
  const lastPaid = [...columns].reverse().find(item => !item.partial && item.pay >= 0.5);
  const payUnit = report.chartGrain === 'year' ? 'year' : 'month';
  // Steady when it moves by less than half a percent of the usual pay each time.
  const payWords =
    payTrend &&
    (Math.abs(payTrend.step) < payTrend.mean * 0.005
      ? 'steady'
      : `${payTrend.step > 0 ? 'up' : 'down'} about ${money(Math.abs(payTrend.step), currency)} a ${payUnit}`);
  return (
    <section className="card flow">
      <header className="card-head">
        <h2>Money in and out</h2>
        <span className={`view-total${waiting ? '' : kept >= 0 ? ' is-up-good' : ' is-down-bad'}`}>
          {kept >= 0 ? '+' : '−'}
          {money(Math.abs(kept), currency)}
        </span>
        <span className="hint">
          {waiting
            ? `so far ${words}: about ${money(usualIn, currency)} usually comes in, not yet this time`
            : moneyIn < 0.5
              ? `nothing came in ${words}`
              : kept >= 0
                ? `kept ${words}, ${Math.round((kept / moneyIn) * 100)}% of what came in`
                : `spent beyond what came in ${words}`}
        </span>
        <ChartSpan grain={report.chartGrain} span={span} onChange={onSpan} />
      </header>
      <dl className="facts">
        <div>
          <dt>Came in</dt>
          <dd>{money(moneyIn, currency)}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd>{money(spent, currency)}</dd>
        </div>
        <div>
          <dt>{toSavings < 0 ? 'Taken from savings' : 'To savings'}</dt>
          <dd>{money(Math.abs(toSavings), currency)}</dd>
        </div>
      </dl>
      <div
        className="flow-chart"
        role="img"
        aria-label="What each period kept, or spent beyond what came in"
        onPointerLeave={() => setHoveredKept(null)}
      >
        {columns.map((item, index) => (
          <span
            key={item.period}
            className={`flow-column${item.period === report.period ? ' is-marked' : ''}${item.partial ? ' is-partial' : ''}`}
            onPointerEnter={event => {
              if (event.pointerType === 'mouse') setHoveredKept(index);
            }}
            // A tap shows it on a phone, and hides it again.
            onClick={() => setHoveredKept(shown => (shown === index ? null : index))}
          >
            <span className="flow-half">
              {item.kept > 0 && <span className="flow-bar is-kept" style={{height: `${(item.kept / top) * 100}%`}} />}
              {hoveredKept === index && (
                <ChartTip
                  column={index}
                  columns={columns.length}
                  bottom={`calc(${item.kept > 0 ? (item.kept / top) * 100 : 0}% + 8px)`}
                >
                  <strong>{periodLabel(item.period, report.chartGrain)}</strong>
                  <span>
                    {item.kept >= 0 ? 'Kept' : 'Short by'} {money(Math.abs(item.kept), currency)}
                    {item.partial === 'ongoing' ? ' so far' : ''}
                  </span>
                  <span>{money(item.moneyIn, currency)} came in</span>
                  <span>{money(item.total, currency)} spent</span>
                  {item.moneyIn >= 0.5 && item.kept > 0 && (
                    <span>{Math.round((item.kept / item.moneyIn) * 100)}% of what came in</span>
                  )}
                </ChartTip>
              )}
            </span>
            <span className="flow-half is-below">
              {item.kept < 0 && <span className="flow-bar is-short" style={{height: `${(-item.kept / top) * 100}%`}} />}
            </span>
            {/* Every third label, counted back from the last one, so the last never runs into another. */}
            <span className="flow-label">
              {(columns.length - 1 - index) % 3 === 0 ? compactPeriodLabel(item.period, report.chartGrain) : ''}
            </span>
          </span>
        ))}
      </div>
      {lastPaid && (
        <div className="pay-trend">
          <p className="pay-trend-head">
            <span className="pay-trend-name">Pay</span>
            <strong className="pay-trend-value">{money(lastPaid.pay, currency)}</strong>
            <span>
              in {periodLabel(lastPaid.period, report.chartGrain)}
              {payWords && ` · trend ${payWords}`}
            </span>
          </p>
          <div
            className="pay-chart"
            role="img"
            aria-label={`Pay per ${payUnit}${payWords ? `, trend ${payWords}` : ''}`}
            onPointerLeave={() => setHoveredPay(null)}
          >
            {columns.map((item, index) => (
              <span
                key={item.period}
                className={`pay-column${item.partial ? ' is-partial' : ''}`}
                onPointerEnter={event => {
                  if (event.pointerType === 'mouse') setHoveredPay(index);
                }}
                // A tap shows it on a phone, and hides it again.
                onClick={() => setHoveredPay(shown => (shown === index ? null : index))}
              >
                <span className="pay-bar" style={{height: `${(item.pay / payTop) * 100}%`}} />
                {hoveredPay === index && (
                  <ChartTip
                    column={index}
                    columns={columns.length}
                    bottom={`calc(${(item.pay / payTop) * 100}% + 8px)`}
                  >
                    <strong>{periodLabel(item.period, report.chartGrain)}</strong>
                    <span>
                      {money(item.pay, currency)} of pay{item.partial === 'ongoing' ? ' so far' : ''}
                    </span>
                  </ChartTip>
                )}
              </span>
            ))}
            {/* The month chart's trend line. */}
            {payTrend && <TrendLine values={rollingAverage(paid)} top={payTop} />}
          </div>
          {/* The same labels as the columns above: every third, counted back from the last one. */}
          <div className="pay-axis" aria-hidden="true">
            {columns.map((item, index) => (
              <span key={item.period}>
                {(columns.length - 1 - index) % 3 === 0 ? compactPeriodLabel(item.period, report.chartGrain) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
