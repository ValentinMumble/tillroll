import { useEffect, useRef, useState } from 'react'
import { BUILT_IN, type Categories, type Category, newCategoryKey } from '../categories'
import type { CategoryKey } from '../types'

interface Props {
  categories: Categories
  /** The store the editor was opened for: a category added now is picked for it. */
  forStore: string | null
  onSave: (list: Category[], added: CategoryKey | null) => void
  onClose: () => void
}

const DEFAULT_ICON = '🏷️'

function differs(category: Category) {
  const original = BUILT_IN.find((item) => item.key === category.key)
  return (
    original &&
    (original.label !== category.label || original.icon !== category.icon || original.spending !== category.spending)
  )
}

/** Rename categories, change their icon or whether they count as spending, add new ones and delete those. */
export function CategoryEditor({ categories, forStore, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Category[]>(categories.list)
  const [added, setAdded] = useState<CategoryKey | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(DEFAULT_ICON)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const update = (key: CategoryKey, change: Partial<Category>) =>
    setDraft(draft.map((category) => (category.key === key ? { ...category, ...change } : category)))

  function add() {
    const label = name.trim()
    if (!label) return
    const category: Category = {
      key: newCategoryKey(label),
      label,
      icon: icon.trim() || DEFAULT_ICON,
      spending: true,
      custom: true,
    }
    const other = draft.findIndex((item) => item.key === 'other')
    setDraft([...draft.slice(0, other), category, ...draft.slice(other)])
    setAdded(category.key)
    setName('')
    setIcon(DEFAULT_ICON)
  }

  function save() {
    // An emptied name or icon goes back to what it was.
    const cleaned = draft.map((category) => {
      const before = categories.byKey[category.key] ?? category
      return { ...category, label: category.label.trim() || before.label, icon: category.icon.trim() || before.icon }
    })
    onSave(cleaned, added && cleaned.some((category) => category.key === added) ? added : null)
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="category-editor-title" onClose={onClose}>
      <header className="dialog-head">
        <h2 id="category-editor-title">Categories</h2>
        <p className="hint">
          {forStore
            ? `Add a category for ${forStore}: it will be picked for all its payments.`
            : 'Rename them, change their icon or add your own. A category that is not spending (like transfers) is left out of the totals.'}
        </p>
      </header>
      <form
        className="category-add"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input
          className="icon-input"
          aria-label="Icon of the new category"
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
        />
        <input
          className="text-input"
          aria-label="Name of the new category"
          placeholder="New category, like Kids or Gifts"
          value={name}
          maxLength={40}
          autoFocus={Boolean(forStore)}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <ul className="category-list">
        {draft.map((category) => (
          <li key={category.key} className={category.key === added ? 'is-new' : undefined}>
            <input
              className="icon-input"
              aria-label={`Icon of ${category.label}`}
              value={category.icon}
              maxLength={8}
              onChange={(event) => update(category.key, { icon: event.target.value })}
            />
            <input
              className="text-input"
              aria-label={`Name of ${category.label}`}
              value={category.label}
              maxLength={40}
              onChange={(event) => update(category.key, { label: event.target.value })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={category.spending}
                onChange={(event) => update(category.key, { spending: event.target.checked })}
              />
              Spending
            </label>
            {category.custom ? (
              <button
                type="button"
                className="link-button"
                onClick={() => setDraft(draft.filter((item) => item.key !== category.key))}
              >
                Delete
              </button>
            ) : differs(category) ? (
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  update(
                    category.key,
                    BUILT_IN.find((item) => item.key === category.key)!,
                  )
                }
              >
                Reset
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      <footer className="dialog-foot">
        <button type="button" className="button is-quiet" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
        <button type="button" className="button is-primary" onClick={save}>
          Save
        </button>
      </footer>
    </dialog>
  )
}
