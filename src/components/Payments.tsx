import { useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import { dayLabel } from '../periods'
import type { Row } from '../report'
import { loadPaymentSort, type PaymentSort, savePaymentSort } from '../storage'
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

/** The sort buttons, with the way each one starts: newest, biggest, A to Z. */
const SORTS: { key: PaymentSort['key']; label: string; descending: boolean }[] = [
  { key: 'date', label: 'Date', descending: true },
  { key: 'amount', label: 'Amount', descending: true },
  { key: 'store', label: 'Store', descending: false },
]

function compare(first: Row, second: Row, { key, descending }: PaymentSort) {
  const byDate = first.date < second.date ? -1 : first.date > second.date ? 1 : 0
  const order =
    key === 'amount'
      ? Math.abs(first.amount) - Math.abs(second.amount)
      : key === 'store'
        ? first.store.localeCompare(second.store, 'en', { sensitivity: 'base' })
        : byDate
  // Ties (same store, same amount) stay newest first.
  return (descending ? -order : order) || -byDate
}

/** The period's payments, by date, amount or store. A category picked here applies to every payment at that store. */
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
  const [sort, setSort] = useState<PaymentSort>(loadPaymentSort)
  const visible = rows
    .filter((row) => {
      if (!everything && !row.counts) return false
      if (focus?.type === 'category') return row.category === focus.key
      if (focus?.type === 'store') return row.storeKey === focus.key
      return true
    })
    .sort((first, second) => compare(first, second, sort))

  /** A new sort starts its own way; the same one again turns it around. */
  function sortBy(key: PaymentSort['key']) {
    const start = SORTS.find((item) => item.key === key)!
    const next = { key, descending: key === sort.key ? !sort.descending : start.descending }
    setSort(next)
    savePaymentSort(next)
  }
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
        <div className="segmented is-small" role="group" aria-label="Sort payments by">
          {SORTS.map((item) => {
            const active = sort.key === item.key
            const way = item.key === 'store' ? (sort.descending ? 'Z to A' : 'A to Z') : sort.descending ? 'down' : 'up'
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                aria-label={active ? `${item.label}, ${way}` : item.label}
                onClick={() => sortBy(item.key)}
              >
                {item.label}
                {active && <span aria-hidden="true">{sort.descending ? ' ↓' : ' ↑'}</span>}
              </button>
            )
          })}
        </div>
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
