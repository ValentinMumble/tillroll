import {useState} from 'react';
import {money} from '../format';
import {periodLabel, shiftPeriod, shortMonth} from '../periods';
import type {SavingsAccount} from '../savings';
import {ChartSpan} from './ChartSpan';
import {ChartTip} from './ChartTip';

interface Props {
  accounts: SavingsAccount[];
  /** This month, as "2026-10": still going. */
  thisMonth: string;
  currency: string;
  /** How far back it goes, shared with the overview's charts (see ChartSpan). */
  span: number;
  onSpan: (span: number) => void;
}

/**
 * What went to the savings accounts each month, less what came back from them (the payment list's "to savings"): a
 * bar up from the middle line for a month that put money aside, down for one that took more back. It goes back 1, 2
 * or 3 years, never before the first move, and its tooltip splits a month by account.
 */
export function PutAside({accounts, thisMonth, currency, span, onSpan}: Props) {
  // The month under the pointer (or tapped), with a tooltip like the month chart's.
  const [hovered, setHovered] = useState<number | null>(null);
  const first = accounts
    .map(account => account.first?.slice(0, 7) ?? '')
    .filter(Boolean)
    .sort()[0];
  if (!first) return null;
  const back = shiftPeriod(thisMonth, 'month', 1 - span * 12);
  const start = first > back ? first : back;
  const columns: {month: string; net: number; parts: {name: string; net: number}[]}[] = [];
  for (let month = start; month <= thisMonth; month = shiftPeriod(month, 'month', 1)) {
    const parts = accounts.map(account => {
      const moved = account.months.find(item => item.month === month);
      return {name: account.name, net: moved ? moved.paidIn - moved.takenOut : 0};
    });
    columns.push({
      month,
      net: parts.reduce((sum, part) => sum + part.net, 0),
      parts: parts.filter(part => Math.abs(part.net) >= 0.5),
    });
  }
  const total = columns.reduce((sum, item) => sum + item.net, 0);
  const top = Math.max(1, ...columns.map(item => Math.abs(item.net)));
  return (
    <section className="card put-aside">
      <header className="card-head">
        <h2>Put aside</h2>
        <span className="view-total">
          {total <= -0.5 && '−'}
          {money(Math.abs(total), currency)}
        </span>
        <span className="hint">
          {total > -0.5 ? 'put aside' : 'taken from savings'} since {periodLabel(start, 'month')}, about{' '}
          {money(Math.abs(total) / columns.length, currency)} a month
        </span>
        <ChartSpan grain="month" span={span} onChange={onSpan} />
      </header>
      <div
        className="flow-chart"
        role="img"
        aria-label="What each month put aside, or took back from savings"
        onPointerLeave={() => setHovered(null)}
      >
        {columns.map((item, index) => {
          const height = (Math.abs(item.net) / top) * 100;
          const ongoing = item.month === thisMonth;
          return (
            <span
              key={item.month}
              className={`flow-column${ongoing ? ' is-partial' : ''}${hovered === index ? ' is-hovered' : ''}`}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse') setHovered(index);
              }}
              // A tap shows it on a phone, and hides it again.
              onClick={() => setHovered(shown => (shown === index ? null : index))}
            >
              <span className="flow-half">
                {item.net >= 0.5 && <span className="flow-bar is-saved" style={{height: `${height}%`}} />}
                {hovered === index && (
                  <ChartTip
                    column={index}
                    columns={columns.length}
                    bottom={`calc(${item.net >= 0.5 ? height : 0}% + 8px)`}
                  >
                    <strong>{periodLabel(item.month, 'month')}</strong>
                    <span>
                      {Math.abs(item.net) >= 0.5
                        ? `${money(Math.abs(item.net), currency)} ${item.net > 0 ? 'put aside' : 'taken from savings'}`
                        : item.parts.length
                          ? 'As much put aside as taken out'
                          : 'Nothing put aside'}
                      {ongoing && ' so far'}
                    </span>
                    {item.parts.map(part => (
                      <span key={part.name}>
                        {part.name} {part.net > 0 ? '+' : '−'}
                        {money(Math.abs(part.net), currency)}
                      </span>
                    ))}
                  </ChartTip>
                )}
              </span>
              <span className="flow-half is-below">
                {item.net <= -0.5 && <span className="flow-bar is-taken" style={{height: `${height}%`}} />}
              </span>
              {/* Every third label, counted back from the last one, so the last never runs into another. */}
              <span className="flow-label">{(columns.length - 1 - index) % 3 === 0 ? shortMonth(item.month) : ''}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
