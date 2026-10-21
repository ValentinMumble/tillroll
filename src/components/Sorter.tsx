import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { type Basis, type Categories, DEFAULT_ICON, oneIcon } from '../categories'
import { money } from '../format'
import { dayLabel } from '../periods'
import type { StoreToSort } from '../report'
import { storeKey } from '../stores'
import type { CategoryKey, Rules } from '../types'
import { useDialog } from '../useDialog'
import { WebSearch } from './WebSearch'

interface Props {
  /**
   * The stores to go through, kept as they were when the deck opened (so the count and Back stay put while sorting):
   * the ones Tillroll is unsure about, and every store still on an automatic category.
   */
  queues: { unsure: StoreToSort[]; automatic: StoreToSort[] }
  categories: Categories
  rules: Rules
  onPick: (storeKey: string, category: CategoryKey) => void
  onNewCategory: (storeKey: string, label: string, icon: string) => void
  onRename: (storeKey: string, name: string, newName: string) => void
  onClose: () => void
}

const REASON: Partial<Record<Basis, string>> = {
  none: 'no clue from the bank',
  'broad-code': 'guessed from a broad shop code',
  transfer: 'a transfer to someone',
  keyword: 'guessed from its name',
  code: 'guessed from its shop code',
  kind: 'guessed from the kind of payment',
}

/**
 * One store at a time, biggest first: one tap files all its payments, past and future. Keep accepts the guess.
 * On a keyboard, 1 to 9 pick the first nine categories, Enter keeps, the arrows go back and on.
 */
export function Sorter({ queues, categories, rules, onPick, onNewCategory, onRename, onClose }: Props) {
  const { ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog } = useDialog()
  const [mode, setMode] = useState<'unsure' | 'automatic'>(queues.unsure.length > 0 ? 'unsure' : 'automatic')
  const [position, setPosition] = useState(0)
  // The store's card and its choices scroll: each new store starts at the top, its name in view.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [position, mode])
  const [filed, setFiled] = useState(0)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  // Names given during this session: the queue holds the names it was opened with.
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<string | null>(null)

  const queue = queues[mode]
  const store = queue[position]
  // A store renamed here gets the key of its new name: its category goes there.
  const name = store ? (renamed[store.key] ?? store.name) : ''
  const key = store ? (renamed[store.key] ? storeKey(renamed[store.key]) : store.key) : ''
  const picked = store ? rules[key] : undefined
  const guess = store ? categories.byKey[store.category] : undefined
  const next = () => setPosition(position + 1)

  function pick(category: CategoryKey) {
    if (!store) return
    onPick(key, category)
    setFiled(filed + 1)
    next()
  }

  function addCategory() {
    const label = newName.trim()
    if (!store || !label) return
    onNewCategory(key, label, newIcon || DEFAULT_ICON)
    setNewName('')
    setNewIcon('')
    setFiled(filed + 1)
    next()
  }

  function rename() {
    if (!store || renaming === null) return
    const newStoreName = renaming.trim()
    if (newStoreName && newStoreName !== name) {
      onRename(key, name, newStoreName)
      setRenamed({ ...renamed, [store.key]: newStoreName })
    }
    setRenaming(null)
  }

  function switchMode(next: 'unsure' | 'automatic') {
    setMode(next)
    setPosition(0)
    setRenaming(null)
  }

  /** The keyboard shortcuts, unless a field has the focus. */
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    onDialogKeyDown(event)
    const target = event.target as HTMLElement
    if (!store || event.defaultPrevented || target.tagName === 'INPUT') return
    const digit = Number(event.key)
    if (digit >= 1 && digit <= 9 && categories.alphabetical[digit - 1]) {
      event.preventDefault()
      pick(categories.alphabetical[digit - 1].key)
    } else if (event.key === 'Enter' && target.tagName !== 'BUTTON' && guess) {
      event.preventDefault()
      pick(picked ?? store.category)
    } else if (event.key === 'ArrowRight') next()
    else if (event.key === 'ArrowLeft' && position > 0) setPosition(position - 1)
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onKeyDown}
      className="dialog sorter"
      aria-labelledby="sorter-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="sorter-title">Stores to sort</h2>
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <div className="segmented is-small" role="group" aria-label="Which stores">
          <button type="button" aria-pressed={mode === 'unsure'} onClick={() => switchMode('unsure')}>
            To sort ({queues.unsure.length})
          </button>
          <button type="button" aria-pressed={mode === 'automatic'} onClick={() => switchMode('automatic')}>
            All guessed ({queues.automatic.length})
          </button>
        </div>
        <p className="hint">
          {queue.length === 0
            ? 'Nothing here: every store has a category.'
            : `${mode === 'unsure' ? 'Stores Tillroll is not sure about' : 'Every store on a guessed category'}, biggest first. ${Math.min(position + 1, queue.length)} of ${queue.length}.`}
        </p>
        {queue.length > 0 && (
          <div className="sorter-progress" aria-hidden="true">
            <span style={{ width: `${(Math.min(position, queue.length) / queue.length) * 100}%` }} />
          </div>
        )}
      </header>

      {store ? (
        <div className="sorter-body" ref={bodyRef}>
          <div className="sorter-store">
            <div className="sorter-name">
              {renaming !== null ? (
                <form
                  className="sorter-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    rename()
                  }}
                >
                  <input
                    className="text-input"
                    aria-label={`New name for ${name}`}
                    value={renaming}
                    maxLength={80}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setRenaming(event.target.value)}
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
                <>
                  <h3>
                    {name} <WebSearch name={name} />
                  </h3>
                  <button type="button" className="link-button" onClick={() => setRenaming(name)}>
                    Rename
                  </button>
                </>
              )}
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
            {picked && categories.byKey[picked] ? (
              <p className="sorter-guess">
                Filed in {categories.byKey[picked].icon} {categories.byKey[picked].label}
              </p>
            ) : (
              guess && (
                <button type="button" className="button is-primary sorter-keep" onClick={() => pick(store.category)}>
                  Keep in {guess.icon} {guess.label}
                  <span className="sorter-reason"> ({REASON[store.basis] ?? 'a guess'})</span>
                </button>
              )
            )}
          </div>
          <div className="chip-grid" role="group" aria-label="Or another category">
            {categories.alphabetical.map((category, index) => {
              const current = (picked ?? store.category) === category.key
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`category-chip${current ? ' is-current' : ''}`}
                  aria-pressed={current}
                  aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                  onClick={() => pick(category.key)}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                  {index < 9 && (
                    <kbd className="chip-key" aria-hidden="true">
                      {index + 1}
                    </kbd>
                  )}
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
              placeholder={DEFAULT_ICON}
              onChange={(event) => setNewIcon(oneIcon(event.target.value, newIcon))}
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
            <p>
              You went through all {queue.length} stores and filed {filed}. The totals already use your choices.
            </p>
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
              Later
            </button>
          </>
        )}
        {!store && (
          <button type="button" className="button is-primary" onClick={closeDialog}>
            Close
          </button>
        )}
      </footer>
    </dialog>
  )
}
