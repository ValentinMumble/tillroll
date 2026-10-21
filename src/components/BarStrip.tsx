import { money } from '../format'

/**
 * One series of bars with their labels under them (weekdays, hours, months): one colour, the length is the value; the
 * biggest is the strong one, with its amount.
 */
export function BarStrip({
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
