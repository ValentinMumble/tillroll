import { useMemo } from 'react'
import { money } from '../format'
import { dayLabel, WEEKDAYS } from '../periods'
import type { Row } from '../report'
import { funStats } from '../stats'

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[]
  currency: string
}

/** One series of bars with its labels under them (weekdays, hours): one colour, the length is the value. */
function Bars({
  values,
  labels,
  titles = labels,
  currency,
  caption,
}: {
  values: number[]
  labels: string[]
  titles?: string[]
  currency: string
  caption: string
}) {
  const top = Math.max(1, ...values)
  const best = values.indexOf(Math.max(...values))
  return (
    <figure className="stat-bars">
      <figcaption>{caption}</figcaption>
      <div className="stat-bars-plot">
        {values.map((value, index) => (
          <div key={labels[index] + index} className="stat-bar" title={`${titles[index]}: ${money(value, currency)}`}>
            <span className="stat-bar-value">{index === best ? money(value, currency) : ''}</span>
            <span
              className={`stat-bar-fill${index === best ? ' is-best' : ''}`}
              style={{ height: `${(value / top) * 100}%` }}
            />
            <span className="stat-bar-label">{labels[index]}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}

/** Playful facts about all the spending: weekdays, hours, records, streaks. */
export function FunStats({ rows, currency }: Props) {
  const stats = useMemo(() => funStats(rows, currency), [rows, currency])
  if (!stats) {
    return (
      <section className="card">
        <p className="empty">No spending yet.</p>
      </section>
    )
  }
  return (
    <section className="card fun-stats">
      <header className="card-head">
        <h2>Fun stats</h2>
        <span className="hint">
          all time, {dayLabel(stats.from, true)} to {dayLabel(stats.to, true)}
        </span>
      </header>
      <div className="stat-charts">
        <Bars
          caption="An average day, by weekday"
          values={stats.weekdays.map((day) => day.average)}
          labels={WEEKDAYS.map((day) => day.slice(0, 3))}
          currency={currency}
        />
        {stats.hours && (
          <Bars
            caption="Spent by hour of the day"
            values={stats.hours}
            labels={stats.hours.map((_value, hour) => (hour % 3 === 0 ? String(hour) : ''))}
            titles={stats.hours.map((_value, hour) => `${hour}:00 to ${hour + 1}:00`)}
            currency={currency}
          />
        )}
      </div>
      <ul className="facts-grid">
        {stats.facts.map((fact) => (
          <li key={fact.title}>
            <span className="fact-icon" aria-hidden="true">
              {fact.icon}
            </span>
            <span className="fact-title">{fact.title}</span>
            <strong className="fact-value">{fact.value}</strong>
            <span className="fact-detail">{fact.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
