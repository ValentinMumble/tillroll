import {money} from '../format';
import {compactPeriodLabel, type Grain, periodLabel} from '../periods';
import type {Report} from '../report';

interface Props {
  report: Report;
  grain: Grain;
  currency: string;
}

/**
 * Money in and out: what came in (pay, money from others; not refunds or moves between one's own accounts), what was
 * spent, and what was kept, with its share of what came in. Under it, what each of the chart's periods kept: a bar up,
 * or down when the period spent more than came in.
 */
export function MoneyFlow({report, grain, currency}: Props) {
  const {moneyIn, total: spent, movedOut} = report.current;
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
          <dt>Moved out, not spent</dt>
          <dd>{money(movedOut, currency)}</dd>
        </div>
      </dl>
      <div className="flow-chart" role="img" aria-label="What each period kept, or spent beyond what came in">
        {columns.map((item, index) => (
          <span
            key={item.period}
            className={`flow-column${item.period === report.period ? ' is-marked' : ''}${item.partial ? ' is-partial' : ''}`}
            title={`${periodLabel(item.period, report.chartGrain)}: ${money(item.moneyIn, currency)} in, ${money(
              item.total,
              currency,
            )} spent, ${item.kept >= 0 ? 'kept' : 'short by'} ${money(Math.abs(item.kept), currency)}`}
          >
            <span className="flow-half">
              {item.kept > 0 && <span className="flow-bar is-kept" style={{height: `${(item.kept / top) * 100}%`}} />}
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
    </section>
  );
}
