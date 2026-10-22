import {money} from '../format';
import type {Grain} from '../periods';
import type {Report} from '../report';

interface Props {
  report: Report;
  grain: Grain;
  currency: string;
}

/**
 * Fixed and flexible: how much of the period's spending was decided in advance (bills, and the payments that come back
 * every month: rent, a loan, subscriptions) and how much was chosen along the way, the part that can change. One bar
 * split in two, each part named with its amount and share.
 */
export function FixedSplit({report, grain, currency}: Props) {
  const {fixed} = report;
  const spent = report.current.total;
  if (fixed === null || spent < 0.5) return null;
  // A refund on a bill can leave more than was spent in all: the bar stays within the total.
  const fixedPart = Math.min(Math.max(0, fixed), spent);
  const flexible = spent - fixedPart;
  const share = (value: number) => Math.round((value / spent) * 100);
  const words = grain === 'year' ? 'this year' : grain === 'all' ? 'over all time' : 'this month';
  const parts = [
    {key: 'fixed', label: 'Fixed', value: fixedPart, hint: 'bills and payments that come back every month'},
    {key: 'flexible', label: 'Flexible', value: flexible, hint: 'everything else, the part you can change'},
  ];
  return (
    <section className="card fixed-split">
      <header className="card-head">
        <h2>Fixed and flexible</h2>
        <span className="hint">
          {share(fixedPart)}% of what you spent {words} was set in advance
        </span>
      </header>
      <div
        className="split-bar"
        role="img"
        aria-label={`Fixed ${money(fixedPart, currency)}, flexible ${money(flexible, currency)}`}
      >
        {parts
          .filter(part => part.value >= 0.5)
          .map(part => (
            <span
              key={part.key}
              className={`is-${part.key}`}
              title={`${part.label}: ${money(part.value, currency)}`}
              style={{flexGrow: part.value}}
            />
          ))}
      </div>
      <dl className="split-facts">
        {parts.map(part => (
          <div key={part.key}>
            <dt>
              <span className={`split-dot is-${part.key}`} aria-hidden="true" />
              {part.label} <span className="muted">· {part.hint}</span>
            </dt>
            <dd>
              {money(part.value, currency)} <span className="muted">{share(part.value)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
