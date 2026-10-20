import { useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import type { Report } from '../report'
import type { CategoryKey } from '../types'
import { Delta } from './Delta'

/** What the payment list is narrowed to: a category or a store. */
export type Focus = { type: 'category'; key: CategoryKey } | { type: 'store'; key: string; name: string }

interface Props {
  report: Report
  categories: Categories
  currency: string
  focus: Focus | null
  onFocus: (focus: Focus | null) => void
}

const STORES_SHOWN = 8

function share(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : ''
}

/** Spending by category, with the change against the baseline. One color for every bar: the length is the value. */
export function CategoryBreakdown({
  report,
  categories,
  currency,
  focus,
  onFocus,
  onEdit,
}: Props & { onEdit: () => void }) {
  const { current, baseline } = report
  const items = [...current.categories]
    .filter(([, value]) => value >= 0.5)
    .sort((first, second) => second[1] - first[1])
  const max = Math.max(1, ...items.map(([, value]) => value))
  return (
    <section className="card">
      <header className="card-head">
        <h2>Categories</h2>
        {baseline && <span className="hint">change vs {baseline.label}</span>}
        <button type="button" className="link-button" onClick={onEdit}>
          Edit categories
        </button>
      </header>
      {items.length === 0 ? (
        <p className="empty">No spending in this period.</p>
      ) : (
        <ul className="bars">
          {items.map(([key, value]) => {
            const category = categories.byKey[key]
            const active = focus?.type === 'category' && focus.key === key
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`bar-row${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onFocus(active ? null : { type: 'category', key })}
                >
                  <span className="bar-label">
                    <span className="bar-icon" aria-hidden="true">
                      {category.icon}
                    </span>
                    {category.label}
                  </span>
                  <span className="bar-value">
                    {money(value, currency)} <small>{share(value, current.total)}</small>
                  </span>
                  <span className="bar-change">
                    {baseline && (
                      <Delta value={value - (baseline.categories.get(key) ?? 0)} currency={currency} compact />
                    )}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(value / max) * 100}%` }} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The stores where the money went, biggest first. */
export function StoreBreakdown({
  report,
  categories,
  currency,
  focus,
  onFocus,
  onEdit,
  onOpenStore,
}: Props & { onEdit: () => void; onOpenStore: (store: { key: string; name: string }) => void }) {
  const [showAll, setShowAll] = useState(false)
  const stores = [...report.current.stores.values()]
    .filter((store) => store.total >= 0.5)
    .sort((first, second) => second.total - first.total)
  const shown = showAll ? stores : stores.slice(0, STORES_SHOWN)
  const max = Math.max(1, ...stores.map((store) => store.total))
  return (
    <section className="card">
      <header className="card-head">
        <h2>Stores</h2>
        <span className="hint">{stores.length} this period</span>
        <button type="button" className="link-button" onClick={onEdit}>
          Edit stores
        </button>
      </header>
      {stores.length === 0 ? (
        <p className="empty">No spending in this period.</p>
      ) : (
        <ul className="bars">
          {shown.map((store) => {
            const active = focus?.type === 'store' && focus.key === store.key
            return (
              <li key={store.key}>
                <button
                  type="button"
                  className={`bar-row${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  title="Double-click to rename it or change its category"
                  onClick={() => onFocus(active ? null : { type: 'store', key: store.key, name: store.name })}
                  onDoubleClick={() => onOpenStore({ key: store.key, name: store.name })}
                >
                  <span className="bar-label">
                    <span className="bar-icon" aria-hidden="true">
                      {categories.byKey[store.category].icon}
                    </span>
                    <span className="bar-name">{store.name}</span>
                  </span>
                  <span className="bar-value">{money(store.total, currency)}</span>
                  <span className="bar-change muted">
                    {store.visits === 1 ? '1 payment' : `${store.visits} payments`}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(store.total / max) * 100}%` }} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {stores.length > STORES_SHOWN && (
        <button type="button" className="link-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${stores.length} stores`}
        </button>
      )}
    </section>
  )
}
