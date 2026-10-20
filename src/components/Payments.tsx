import { useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import { dayLabel } from '../periods'
import type { Row } from '../report'
import type { CategoryKey, Rules } from '../types'
import type { Focus } from './Breakdown'

interface Props {
  rows: Row[]
  rules: Rules
  categories: Categories
  focus: Focus | null
  onClearFocus: () => void
  onCategory: (storeKey: string, category: CategoryKey | null) => void
  /** Opens the category editor to add a category for this store. */
  onNewCategory: (storeKey: string, storeName: string) => void
  /** Opens the store editor on this store. */
  onEditStore: (storeKey: string) => void
  /** Opens one store's dialog (name and category), on a double-click. */
  onOpenStore: (store: { key: string; name: string }) => void
}

/** The select's last choice, which opens the category editor instead. */
const NEW_CATEGORY = 'new'

const PAGE = 60

/** The period's payments, newest first. A category picked here applies to every payment at that store. */
export function Payments({
  rows,
  rules,
  categories,
  focus,
  onClearFocus,
  onCategory,
  onNewCategory,
  onEditStore,
  onOpenStore,
}: Props) {
  const [everything, setEverything] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const visible = rows.filter((row) => {
    if (!everything && !row.counts) return false
    if (focus?.type === 'category') return row.category === focus.key
    if (focus?.type === 'store') return row.storeKey === focus.key
    return true
  })
  const focusLabel =
    focus?.type === 'category'
      ? `${categories.byKey[focus.key]?.icon} ${categories.byKey[focus.key]?.label}`
      : focus?.name
  return (
    <section className="card payments">
      <header className="card-head">
        <h2>Payments</h2>
        {focus && (
          <button type="button" className="chip" onClick={onClearFocus}>
            {focusLabel} <span aria-label="Show all payments">✕</span>
          </button>
        )}
        {focus?.type === 'store' && (
          <button type="button" className="link-button" onClick={() => onEditStore(focus.key)}>
            Rename or merge
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
              <tr key={row.id} className={row.counts ? undefined : 'is-muted'}>
                <td className="payment-day">{dayLabel(row.date)}</td>
                <td className="payment-store">
                  <span
                    className="payment-store-name"
                    title={`${row.description}\nDouble-click to rename it or change its category`}
                    onDoubleClick={() => onOpenStore({ key: row.storeKey, name: row.store })}
                  >
                    {row.store}
                  </span>
                  {row.pending && <span className="tag">pending</span>}
                </td>
                <td className="payment-category">
                  <select
                    className="select"
                    aria-label={`Category of ${row.store}`}
                    value={categories.byKey[rules[row.storeKey]] ? rules[row.storeKey] : ''}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === NEW_CATEGORY) onNewCategory(row.storeKey, row.store)
                      else onCategory(row.storeKey, value || null)
                    }}
                  >
                    <option value="">
                      {categories.byKey[row.guessed].icon} {categories.byKey[row.guessed].label} (auto)
                    </option>
                    {categories.alphabetical.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.icon} {category.label}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>＋ New category…</option>
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
