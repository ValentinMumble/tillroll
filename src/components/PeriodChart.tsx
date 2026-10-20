import { useState } from 'react'
import { compactMoney, money } from '../format'
import { type Grain, periodLabel } from '../periods'
import type { Report } from '../report'

interface Props {
  series: Report['series']
  selected: string
  grain: Grain
  currency: string
  usual: number | null
  onSelect: (period: string) => void
}

/** Round steps for the value axis: 0, 250, 500... */
function ticksFor(max: number) {
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((factor) => rough <= factor * magnitude) ?? 10) * magnitude
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_value, index) => index * step)
}

/** Spending per week or month, one column each; the chosen period is the strong one. */
export function PeriodChart({ series, selected, grain, currency, usual, onSelect }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const ticks = ticksFor(Math.max(1, usual ?? 0, ...series.map((item) => item.total)))
  const top = ticks[ticks.length - 1]
  const height = (value: number) => `${(Math.max(0, value) / top) * 100}%`
  return (
    <figure className={`chart${series.length > 12 ? ' is-dense' : ''}`}>
      <figcaption className="visually-hidden">Spending per {grain}</figcaption>
      <div className="chart-plot">
        {ticks.map((tick) => (
          <div key={tick} className="chart-gridline" style={{ bottom: height(tick) }}>
            <span>{compactMoney(tick, currency)}</span>
          </div>
        ))}
        {usual !== null && usual > 0 && (
          <div className="chart-usual" style={{ bottom: height(usual) }}>
            <span>usual</span>
          </div>
        )}
        <div className="chart-columns" onMouseLeave={() => setHovered(null)}>
          {series.map((item, index) => {
            const edge = index < 2 ? ' is-start' : index > series.length - 3 ? ' is-end' : ''
            return (
              <button
                key={item.period}
                type="button"
                className={`chart-column${item.period === selected ? ' is-selected' : ''}`}
                aria-pressed={item.period === selected}
                aria-label={`${periodLabel(item.period, grain)}: ${money(item.total, currency)}`}
                onClick={() => onSelect(item.period)}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
              >
                <span className="chart-bar" style={{ height: height(item.total) }} />
                {hovered === index && (
                  <span
                    className={`chart-tip${edge}`}
                    role="tooltip"
                    style={{ bottom: `calc(${height(item.total)} + 10px)` }}
                  >
                    <strong>{periodLabel(item.period, grain)}</strong>
                    <span>
                      {money(item.total, currency)} · {item.payments} payments
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        {series.map((item) => (
          <span key={item.period} className={item.period === selected ? 'is-selected' : undefined}>
            {periodLabel(item.period, grain, true)}
          </span>
        ))}
      </div>
    </figure>
  )
}
