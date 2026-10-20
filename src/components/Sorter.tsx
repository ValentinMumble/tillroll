import { useEffect, useRef, useState } from 'react'
import type { Basis, Categories } from '../categories'
import { money } from '../format'
import { dayLabel } from '../periods'
import type { StoreToSort } from '../report'
import { storeKey } from '../stores'
import type { CategoryKey, Rules } from '../types'

interface Props {
  /** The stores to sort when the deck opened: it keeps them, so the count and Back stay put while sorting. */
  queue: StoreToSort[]
  categories: Categories
  rules: Rules
  onPick: (storeKey: string, category: CategoryKey) => void
  onNewCategory: (storeKey: string, label: string, icon: string) => void
  onRename: (storeKey: string, name: string, newName: string) => void
  onClose: () => void
}

const DEFAULT_ICON = '🏷️'

const REASON: Partial<Record<Basis, string>> = {
  none: 'no clue from the bank',
  'broad-code': 'guessed from a broad shop code',
  transfer: 'a transfer to someone',
}

/** One store at a time, biggest first: one tap files all its payments, past and future. */
export function Sorter({ queue, categories, rules, onPick, onNewCategory, onRename, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [position, setPosition] = useState(0)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON)
  // Names given during this session: the queue holds the names it was opened with.
  const [renamed, setRenamed] = useState<Record<string, string>>({})

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const store = queue[position]
  // A store renamed here gets the key of its new name: its category goes there.
  const name = store ? (renamed[store.key] ?? store.name) : ''
  const key = store ? (renamed[store.key] ? storeKey(renamed[store.key]) : store.key) : ''
  const picked = store ? rules[key] : undefined
  const next = () => setPosition(position + 1)

  function pick(category: CategoryKey) {
    if (!store) return
    onPick(key, category)
    next()
  }

  function addCategory() {
    const label = newName.trim()
    if (!store || !label) return
    onNewCategory(key, label, newIcon.trim() || DEFAULT_ICON)
    setNewName('')
    setNewIcon(DEFAULT_ICON)
    next()
  }

  function rename() {
    if (!store) return
    const newStoreName = window.prompt(`New name for ${name}`, name)?.trim()
    if (!newStoreName || newStoreName === name) return
    onRename(key, name, newStoreName)
    setRenamed({ ...renamed, [store.key]: newStoreName })
  }

  return (
    <dialog ref={dialog} className="dialog sorter" aria-labelledby="sorter-title" onClose={onClose}>
      <header className="dialog-head">
        <h2 id="sorter-title">Sort your stores</h2>
        <p className="hint">
          {queue.length === 0
            ? 'Nothing to sort: every store has a sure category.'
            : `Stores Tillroll is not sure about, biggest first. ${Math.min(position + 1, queue.length)} of ${queue.length}.`}
        </p>
        {queue.length > 0 && (
          <div className="sorter-progress" aria-hidden="true">
            <span style={{ width: `${(Math.min(position, queue.length) / queue.length) * 100}%` }} />
          </div>
        )}
      </header>

      {store ? (
        <div className="sorter-body">
          <div className="sorter-store">
            <div className="sorter-name">
              <h3>{name}</h3>
              <button type="button" className="link-button" onClick={rename}>
                Rename
              </button>
            </div>
            <p className="muted">
              {store.payments === 1 ? '1 payment' : `${store.payments} payments`} · {money(store.total, store.currency)}{' '}
              · last on {dayLabel(store.lastDate, true)}
            </p>
            <ul className="sorter-examples" aria-label="What the bank says">
              {store.examples.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p className="sorter-guess">
              {picked && categories.byKey[picked] ? (
                <>
                  Filed in {categories.byKey[picked].icon} {categories.byKey[picked].label}
                </>
              ) : (
                <>
                  Now in {categories.byKey[store.category]?.icon} {categories.byKey[store.category]?.label}
                  <span className="muted"> ({REASON[store.basis] ?? 'a guess'})</span>
                </>
              )}
            </p>
          </div>
          <div className="chip-grid" role="group" aria-label="Category">
            {categories.list.map((category) => {
              const current = (picked ?? store.category) === category.key
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`category-chip${current ? ' is-current' : ''}`}
                  aria-pressed={current}
                  onClick={() => pick(category.key)}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                </button>
              )
            })}
          </div>
          <form
            className="category-add"
            onSubmit={(event) => {
              event.preventDefault()
              addCategory()
            }}
          >
            <input
              className="icon-input"
              aria-label="Icon of the new category"
              value={newIcon}
              maxLength={8}
              onChange={(event) => setNewIcon(event.target.value)}
            />
            <input
              className="text-input"
              aria-label="New category for this store"
              placeholder="Or a new category for it"
              value={newName}
              maxLength={40}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit" className="button" disabled={!newName.trim()}>
              Add
            </button>
          </form>
        </div>
      ) : (
        queue.length > 0 && (
          <div className="sorter-done">
            <p className="hero">🎉</p>
            <p>All {queue.length} stores went through. The totals already use your choices.</p>
          </div>
        )
      )}

      <footer className="dialog-foot">
        {store && (
          <>
            <button
              type="button"
              className="button is-quiet"
              disabled={position === 0}
              onClick={() => setPosition(position - 1)}
            >
              Back
            </button>
            <button type="button" className="button" onClick={next}>
              Skip
            </button>
          </>
        )}
        <button type="button" className="button is-primary" onClick={() => dialog.current?.close()}>
          {store ? 'Done for now' : 'Close'}
        </button>
      </footer>
    </dialog>
  )
}
