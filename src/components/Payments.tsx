import { useState } from 'react'
import { CATEGORIES, CATEGORY } from '../categories'
import { money } from '../format'
import { dayLabel } from '../periods'
import type { Row } from '../report'
import type { CategoryKey, Rules } from '../types'
import type { Focus } from './Breakdown'

interface Props {
  rows: Row[]
  rules: Rules
  focus: Focus | null
  onClearFocus: () => void
  onCategory: (storeKey: string, category: CategoryKey | null) => void
}

const PAGE = 60

/** The period's payments, newest first. A category picked here applies to every payment at that store. */
export function Payments({ rows, rules, focus, onClearFocus, onCategory }: Props) {
  const [everything, setEverything] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const visible = rows.filter((row) => {
    if (!everything && !CATEGORY[row.category].spending) return false
    if (focus?.type === 'category') return row.category === focus.key
    if (focus?.type === 'store') return row.storeKey === focus.key
    return true
  })
  const focusLabel =
    focus?.type === 'category' ? `${CATEGORY[focus.key].icon} ${CATEGORY[focus.key].label}` : focus?.name
  return (
    <section className="card payments">
      <header className="card-head">
        <h2>Payments</h2>
        {focus && (
          <button type="button" className="chip" onClick={onClearFocus}>
            {focusLabel} <span aria-label="Show all payments">✕</span>
          </button>
        )}
        <label className="toggle">
          <input type="checkbox" checked={everything} onChange={(event) => setEverything(event.target.checked)} />
          Show transfers and money in
        </label>
      </header>
      {visible.length === 0 ? (
        <p className="empty">No payments here.</p>
      ) : (
        <table>
          <thead className="visually-hidden">
            <tr>
              <th>Day</th>
              <th>Store</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((row) => (
              <tr key={row.id} className={CATEGORY[row.category].spending ? undefined : 'is-muted'}>
                <td className="payment-day">{dayLabel(row.date)}</td>
                <td className="payment-store">
                  <span title={row.description}>{row.store}</span>
                  {row.pending && <span className="tag">pending</span>}
                </td>
                <td className="payment-category">
                  <select
                    className="select"
                    aria-label={`Category of ${row.store}`}
                    value={rules[row.storeKey] ?? ''}
                    onChange={(event) => onCategory(row.storeKey, (event.target.value || null) as CategoryKey | null)}
                  >
                    <option value="">
                      {CATEGORY[row.guessed].icon} {CATEGORY[row.guessed].label} (auto)
                    </option>
                    {CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.icon} {category.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`payment-amount${row.amount > 0 ? ' is-in' : ''}`}>
                  {money(row.amount, row.currency, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {visible.length > limit && (
        <button type="button" className="link-button" onClick={() => setLimit(limit + PAGE * 2)}>
          Show more ({visible.length - limit} left)
        </button>
      )}
    </section>
  )
}
