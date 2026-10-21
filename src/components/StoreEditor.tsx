import { useMemo, useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import type { Row } from '../report'
import type { CategoryKey, Merges, Rules } from '../types'
import { useDialog } from '../useDialog'
import { WebSearch } from './WebSearch'

interface Props {
  rows: Row[]
  rules: Rules
  categories: Categories
  merges: Merges
  /** The store to start with, ticked and on top. */
  preselected: string | null
  onRename: (storeKey: string, name: string, newName: string) => void
  onCategory: (storeKey: string, category: CategoryKey | null) => void
  onMerge: (storeKeys: string[], into: string) => void
  onSeparate: (storeKey: string) => void
  onClose: () => void
}

interface StoreLine {
  key: string
  name: string
  currency: string
  payments: number
  /** Money out at that store, all time. */
  total: number
  /** The category most of its payments would get without a choice by hand. */
  guessed: CategoryKey
}

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function mostCommon(counts: Map<CategoryKey, number>) {
  return [...counts].sort((first, second) => second[1] - first[1])[0][0]
}

/** Every store: rename it, pick its category, or tick the ones that are the same place and merge them. */
export function StoreEditor(props: Props) {
  const { rows, rules, categories, merges, preselected, onRename, onCategory, onMerge, onSeparate, onClose } = props
  const { ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog } = useDialog()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : [])
  // The name kept when merging: the store the editor was opened from, unless another is chosen.
  const [kept, setKept] = useState<string | null>(preselected)
  const [editing, setEditing] = useState<{ key: string; name: string } | null>(null)

  const stores = useMemo(() => {
    const byKey = new Map<string, StoreLine & { guesses: Map<CategoryKey, number> }>()
    for (const row of rows) {
      const store = byKey.get(row.storeKey) ?? {
        key: row.storeKey,
        name: row.store,
        currency: row.currency,
        payments: 0,
        total: 0,
        guessed: row.guessed,
        guesses: new Map<CategoryKey, number>(),
      }
      store.payments += 1
      if (row.amount < 0) store.total -= row.amount
      store.guesses.set(row.guessed, (store.guesses.get(row.guessed) ?? 0) + 1)
      byKey.set(row.storeKey, store)
    }
    return [...byKey.values()]
      .map(({ guesses, ...store }) => ({ ...store, guessed: mostCommon(guesses) }))
      .sort((first, second) => second.total - first.total || second.payments - first.payments)
  }, [rows])

  const merged = useMemo(() => {
    const names = new Map(rows.map((row) => [row.ownStoreKey, row.ownStore]))
    return Object.entries(merges).map(([key, into]) => ({ key, name: names.get(key) ?? key, into }))
  }, [rows, merges])

  const words = plain(query).split(/\s+/).filter(Boolean)
  const pickedStores = stores.filter((store) => picked.includes(store.key))
  // The store the editor was opened from stays on top; ticked rows stay where they are.
  const matching = stores.filter((store) => words.every((word) => plain(store.name).includes(word)))
  const opened = preselected ? stores.find((store) => store.key === preselected) : undefined
  const shown = opened ? [opened, ...matching.filter((store) => store.key !== opened.key)] : matching
  const target = pickedStores.find((store) => store.key === kept) ?? pickedStores[0]
  // What the merge gives: all their payments under one name, with the category the store kept has.
  const mergedPayments = pickedStores.reduce((sum, store) => sum + store.payments, 0)
  const keptRule = target ? rules[target.key] : undefined
  const inheritedRule = pickedStores.map((store) => rules[store.key]).find(Boolean)
  const mergedCategory = target ? categories.byKey[keptRule ?? inheritedRule ?? target.guessed] : undefined

  function toggle(key: string) {
    setPicked(picked.includes(key) ? picked.filter((item) => item !== key) : [...picked, key])
  }

  function finishRename() {
    if (!editing) return
    const store = stores.find((item) => item.key === editing.key)
    const name = editing.name.trim()
    if (store && name && name !== store.name) onRename(store.key, store.name, name)
    setEditing(null)
  }

  function merge() {
    if (!target || pickedStores.length < 2) return
    onMerge(
      pickedStores.filter((store) => store.key !== target.key).map((store) => store.key),
      target.name,
    )
    setPicked([])
    setKept(null)
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog store-editor"
      aria-labelledby="store-editor-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="store-editor-title">Stores</h2>
        <p className="hint">
          Rename a store or pick its category. Tick stores that are the same place to merge them into one.
        </p>
      </header>
      <input
        className="text-input"
        type="search"
        aria-label="Find a store"
        placeholder={`Find a store among ${stores.length}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="store-lines">
        {shown.slice(0, 80).map((store) => {
          const rule = rules[store.key] && categories.byKey[rules[store.key]] ? rules[store.key] : ''
          const auto = categories.byKey[store.guessed]
          return (
            <li key={store.key} className={picked.includes(store.key) ? 'is-picked' : undefined}>
              <input
                type="checkbox"
                aria-label={`Tick ${store.name} to merge it`}
                checked={picked.includes(store.key)}
                onChange={() => toggle(store.key)}
              />
              <div className="store-line-name">
                {editing?.key === store.key ? (
                  <input
                    className="text-input"
                    aria-label={`New name for ${store.name}`}
                    value={editing.name}
                    maxLength={80}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setEditing({ key: store.key, name: event.target.value })}
                    onBlur={finishRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') finishRename()
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditing(null)
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="store-line-rename"
                    aria-label={`Rename ${store.name}`}
                    onClick={() => setEditing({ key: store.key, name: store.name })}
                  >
                    {store.name} <span aria-hidden="true">✎</span>
                  </button>
                )}
                {editing?.key !== store.key && <WebSearch name={store.name} />}
                <span className="muted">
                  {store.payments === 1 ? '1 payment' : `${store.payments} payments`}
                  {store.total > 0 && ` · ${money(store.total, store.currency)}`}
                </span>
              </div>
              <select
                className="select"
                aria-label={`Category of ${store.name}`}
                value={rule}
                onChange={(event) => onCategory(store.key, event.target.value || null)}
              >
                <option value="">
                  {auto?.icon} {auto?.label} (auto)
                </option>
                {categories.alphabetical.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.icon} {category.label}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
        {shown.length === 0 && <li className="empty">No store matches.</li>}
        {shown.length > 80 && <li className="empty">Showing 80 of {shown.length}: search to find the others.</li>}
      </ul>
      {pickedStores.length >= 2 && target && (
        <div className="merge-bar">
          <label className="keep-name">
            Keep the name
            <select className="select" value={target.key} onChange={(event) => setKept(event.target.value)}>
              {pickedStores.map((store) => (
                <option key={store.key} value={store.key}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button is-primary" onClick={merge}>
            Merge {pickedStores.length} stores
          </button>
          <p className="merge-preview">
            {target.name} will hold {mergedPayments} payments, in {mergedCategory?.icon} {mergedCategory?.label}.
          </p>
        </div>
      )}
      {merged.length > 0 && (
        <section className="merged">
          <h3>Merged and renamed</h3>
          <ul>
            {merged.map((item) => (
              <li key={item.key}>
                <span>
                  {item.name} <span className="muted">→ {item.into}</span>
                </span>
                <button type="button" className="link-button" onClick={() => onSeparate(item.key)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="dialog-foot">
        <button type="button" className="button is-primary" onClick={closeDialog}>
          Done
        </button>
      </footer>
    </dialog>
  )
}
