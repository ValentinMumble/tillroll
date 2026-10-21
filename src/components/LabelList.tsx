import { useState } from 'react'
import { money } from '../format'
import { tidyLabel } from '../labels'
import { dayLabel } from '../periods'
import type { Row } from '../report'

interface Props {
  /** The payments of one currency, all time. */
  rows: Row[]
  currency: string
  onOpen: (label: string) => void
  onRename: (label: string, newLabel: string) => void
  onDelete: (label: string) => void
}

interface LabelLine {
  name: string
  total: number
  payments: number
  from: string
  to: string
}

/** Every label with what it adds up to (all time): open its payments, rename it or take it off everywhere. */
export function LabelList({ rows, currency, onOpen, onRename, onDelete }: Props) {
  const [renaming, setRenaming] = useState<{ label: string; text: string } | null>(null)
  const lines = new Map<string, LabelLine>()
  for (const row of rows) {
    for (const label of row.labels) {
      const key = label.toLowerCase()
      const line = lines.get(key) ?? { name: label, total: 0, payments: 0, from: row.date, to: row.date }
      line.total += row.spend
      line.payments += 1
      if (row.date < line.from) line.from = row.date
      if (row.date > line.to) line.to = row.date
      lines.set(key, line)
    }
  }
  const labels = [...lines.values()].sort((first, second) => (first.to < second.to ? 1 : -1))

  function finishRename() {
    if (!renaming) return
    const text = tidyLabel(renaming.text)
    if (text && text !== renaming.label) onRename(renaming.label, text)
    setRenaming(null)
  }

  return (
    <section className="card labels">
      <header className="card-head">
        <h2>Labels</h2>
        <span className="hint">all time, newest first</span>
      </header>
      {labels.length === 0 ? (
        <p className="empty">
          No labels yet. Add one with the # beside a payment, tick payments to label them together, or pick a run of
          days in the calendar for a trip.
        </p>
      ) : (
        <ul className="label-lines">
          {labels.map((line) => (
            <li key={line.name}>
              {renaming?.label === line.name ? (
                <form
                  className="label-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    finishRename()
                  }}
                >
                  <input
                    className="text-input"
                    aria-label={`New name for the label ${line.name}`}
                    value={renaming.text}
                    maxLength={40}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setRenaming({ label: line.name, text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setRenaming(null)
                      }
                    }}
                  />
                  <button type="submit" className="button">
                    Rename
                  </button>
                </form>
              ) : (
                <button type="button" className="label-open" onClick={() => onOpen(line.name)}>
                  <span className="label-name"># {line.name}</span>
                  <span className="muted">
                    {line.payments === 1 ? '1 payment' : `${line.payments} payments`} ·{' '}
                    {line.from === line.to
                      ? dayLabel(line.from, true)
                      : `${dayLabel(line.from, line.from.slice(0, 4) !== line.to.slice(0, 4))} to ${dayLabel(line.to, true)}`}
                  </span>
                  <strong className="label-total">{money(line.total, currency)}</strong>
                </button>
              )}
              {renaming?.label !== line.name && (
                <span className="label-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setRenaming({ label: line.name, text: line.name })}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      const count = line.payments === 1 ? 'its payment' : `its ${line.payments} payments`
                      if (window.confirm(`Take the label "${line.name}" off ${count}?`)) onDelete(line.name)
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
