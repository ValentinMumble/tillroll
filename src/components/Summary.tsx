import { money } from '../format'
import { daysBetween, type Grain, periodLabel, today } from '../periods'
import type { Report } from '../report'
import { Delta } from './Delta'

interface Props {
  report: Report
  period: string
  grain: Grain
  currency: string
}

/** The receipt's total: what the period cost, against the usual period or the previous one so far. */
export function Summary({ report, period, grain, currency }: Props) {
  const { current, baseline, ongoing } = report
  const days = daysBetween(report.from, ongoing ? today() : report.to)
  return (
    <div className="summary">
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
  )
}
