import { useEffect, useMemo, useRef, useState } from 'react'
import type { Categories } from '../categories'
import { money } from '../format'
import type { Row } from '../report'
import type { CategoryKey, Rules } from '../types'

interface Props {
  store: { key: string; name: string }
  rows: Row[]
  rules: Rules
  categories: Categories
  onSave: (newName: string, category: CategoryKey | null) => void
  /** Opens the full store editor, to merge this store with others. */
  onMore: () => void
  onClose: () => void
}

/** One store, opened with a double-click: its name and its category. */
export function StoreDialog({ store, rows, rules, categories, onSave, onMore, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const picked = rules[store.key] && categories.byKey[rules[store.key]] ? rules[store.key] : ''
  const [name, setName] = useState(store.name)
  const [category, setCategory] = useState<CategoryKey>(picked)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const facts = useMemo(() => {
    const own = rows.filter((row) => row.storeKey === store.key)
    const counts = new Map<CategoryKey, number>()
    for (const row of own) counts.set(row.guessed, (counts.get(row.guessed) ?? 0) + 1)
    return {
      payments: own.length,
      spent: own.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
      currency: own[0]?.currency ?? 'EUR',
      guessed: [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] ?? 'other',
      texts: [...new Set(own.map((row) => row.description))].slice(0, 3),
    }
  }, [rows, store.key])
  const auto = categories.byKey[facts.guessed]

  function save() {
    const newName = name.trim() || store.name
    if (newName !== store.name || category !== picked) onSave(newName, category || null)
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="dialog store-dialog" aria-labelledby="store-dialog-title" onClose={onClose}>
      <form
        className="store-dialog-form"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <header className="dialog-head">
          <h2 id="store-dialog-title">{store.name}</h2>
          <p className="hint">
            {facts.payments === 1 ? '1 payment' : `${facts.payments} payments`}
            {facts.spent > 0 && ` · ${money(facts.spent, facts.currency)}`}
          </p>
          <ul className="sorter-examples" aria-label="What the bank says">
            {facts.texts.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </header>
        <label className="field">
          Name
          <input
            className="text-input"
            value={name}
            maxLength={80}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Category
          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">
              {auto?.icon} {auto?.label} (auto)
            </option>
            {categories.alphabetical.map((item) => (
              <option key={item.key} value={item.key}>
                {item.icon} {item.label}
              </option>
            ))}
          </select>
        </label>
        <footer className="dialog-foot">
          <button
            type="button"
            className="link-button store-dialog-more"
            // The store editor takes this dialog's place (closing first would end with no dialog at all).
            onClick={onMore}
          >
            Merge with other stores…
          </button>
          <button type="button" className="button is-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button is-primary">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  )
}
