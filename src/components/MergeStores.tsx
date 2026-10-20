import { useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '../report'
import type { Merges } from '../types'

interface Props {
  rows: Row[]
  merges: Merges
  /** The store to start with, ticked. */
  preselected: string | null
  onMerge: (storeKeys: string[], into: string) => void
  onSeparate: (storeKey: string) => void
  onClose: () => void
}

interface StoreChoice {
  key: string
  name: string
  payments: number
}

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Pick the stores that are the same place: they become one, under the name kept. */
export function MergeStores({ rows, merges, preselected, onMerge, onSeparate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : [])
  const [kept, setKept] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  // Every store as it shows now (merged ones under their new name), most payments first.
  const stores = useMemo(() => {
    const byKey = new Map<string, StoreChoice>()
    for (const row of rows) {
      const store = byKey.get(row.storeKey) ?? { key: row.storeKey, name: row.store, payments: 0 }
      store.payments += 1
      byKey.set(row.storeKey, store)
    }
    return [...byKey.values()].sort((first, second) => second.payments - first.payments)
  }, [rows])

  const merged = useMemo(() => {
    const names = new Map(rows.map((row) => [row.ownStoreKey, row.ownStore]))
    return Object.entries(merges).map(([key, into]) => ({ key, name: names.get(key) ?? key, into }))
  }, [rows, merges])

  const words = plain(query).split(/\s+/).filter(Boolean)
  const shown = stores.filter(
    (store) => picked.includes(store.key) || words.every((word) => plain(store.name).includes(word)),
  )
  const pickedStores = stores.filter((store) => picked.includes(store.key))
  // The name kept: the one chosen, or the store with the most payments.
  const target = pickedStores.find((store) => store.key === kept) ?? pickedStores[0]

  function toggle(key: string) {
    setPicked(picked.includes(key) ? picked.filter((item) => item !== key) : [...picked, key])
  }

  function merge() {
    if (!target || pickedStores.length < 2) return
    onMerge(
      pickedStores.filter((store) => store.key !== target.key).map((store) => store.key),
      target.name,
    )
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="merge-stores-title" onClose={onClose}>
      <header className="dialog-head">
        <h2 id="merge-stores-title">Merge stores</h2>
        <p className="hint">
          Tick the stores that are the same place. They show as one store, under the name you keep, with its category.
        </p>
      </header>
      <input
        className="text-input"
        type="search"
        aria-label="Find a store"
        placeholder="Find a store"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="store-picker">
        {shown.slice(0, 60).map((store) => (
          <li key={store.key}>
            <label className="check">
              <input type="checkbox" checked={picked.includes(store.key)} onChange={() => toggle(store.key)} />
              <span className="store-picker-name">{store.name}</span>
              <span className="muted">{store.payments === 1 ? '1 payment' : `${store.payments} payments`}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="empty">No store matches.</li>}
      </ul>
      {pickedStores.length >= 2 && target && (
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
      )}
      {merged.length > 0 && (
        <section className="merged">
          <h3>Merged so far</h3>
          <ul>
            {merged.map((item) => (
              <li key={item.key}>
                <span>
                  {item.name} <span className="muted">→ {item.into}</span>
                </span>
                <button type="button" className="link-button" onClick={() => onSeparate(item.key)}>
                  Separate
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="dialog-foot">
        <button type="button" className="button is-quiet" onClick={() => dialog.current?.close()}>
          Close
        </button>
        <button type="button" className="button is-primary" disabled={pickedStores.length < 2} onClick={merge}>
          {pickedStores.length < 2 ? 'Tick two stores or more' : `Merge ${pickedStores.length} stores`}
        </button>
      </footer>
    </dialog>
  )
}
