import { useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import { dayLabel, weekdayLabel } from '../periods'
import type { Row } from '../report'
import type { CategoryKey } from '../types'
import { CategorySheet } from './CategorySheet'

interface Props {
  /** The period's payments, newest first. */
  rows: Row[]
  categories: Categories
  onSeeAll: () => void
  /** The category of a payment, for its store or for this payment only (scope "store" or "payment"). */
  onCategorize: (rows: Row[], category: CategoryKey | null, scope: string) => void
  onCreateCategory: (rows: Row[], label: string, icon: string, scope: string) => void
}

const SHOWN = 6

/** The overview's last few payments of the period, each with its category to change, and the way to the full list. */
export function LatestPayments({ rows, categories, onSeeAll, onCategorize, onCreateCategory }: Props) {
  const [sheet, setSheet] = useState<Row | null>(null)
  const spending = rows.filter((row) => row.counts)
  const latest = spending.slice(0, SHOWN)
  return (
    <section className="card is-preview latest">
      <header className="card-head">
        <h2>Latest payments</h2>
        {spending.length > SHOWN && (
          <button type="button" className="link-button" onClick={onSeeAll}>
            All {spending.length} payments →
          </button>
        )}
      </header>
      {latest.length === 0 ? (
        <p className="empty">No payments in this period.</p>
      ) : (
        <ul>
          {latest.map((row) => {
            const category = categories.byKey[row.category]
            return (
              <li key={row.id}>
                <span className="latest-store">
                  {row.store}
                  {row.pending && <span className="tag">pending</span>}
                </span>
                <span className="latest-day">
                  {weekdayLabel(row.date)}
                  {row.time && ` ${row.time}`}
                </span>
                <button
                  type="button"
                  className={`category-button${row.basis === 'picked' ? '' : ' is-auto'}`}
                  aria-label={`Category of this payment at ${row.store}: ${category?.label}. Change it`}
                  onClick={() => setSheet(row)}
                >
                  <span aria-hidden="true">{category?.icon}</span>
                  <span className="category-button-label">{category?.label}</span>
                  {row.ownCategory && (
                    <span className="own-mark" title="Picked for this payment only">
                      •
                    </span>
                  )}
                </button>
                <span className={`payment-amount${row.amount > 0 ? ' is-in' : ''}`}>
                  {money(row.amount, row.currency, true)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {sheet && (
        <CategorySheet
          title={sheet.store}
          detail={`${dayLabel(sheet.date, true)} · ${money(sheet.amount, sheet.currency, true)}`}
          scopes={[
            { key: 'store', label: `Every payment at ${sheet.store}, past and future` },
            { key: 'payment', label: 'Only this payment' },
          ]}
          categories={categories}
          current={sheet.category}
          onPick={(category, scope) => onCategorize([sheet], category, scope)}
          onCreate={(label, icon, scope) => onCreateCategory([sheet], label, icon, scope)}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}
