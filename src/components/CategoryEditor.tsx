import {useState} from 'react';
import {BUILT_IN, type Categories, type Category, DEFAULT_ICON, LEFT_OUT, newCategoryKey, oneIcon} from '../categories';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';

interface Props {
  categories: Categories;
  /** The store the editor was opened for: a category added now is picked for it. */
  forStore: string | null;
  onSave: (list: Category[], added: CategoryKey | null) => void;
  onClose: () => void;
}

function differs(category: Category) {
  const original = BUILT_IN.find(item => item.key === category.key);
  return (
    original &&
    (original.label !== category.label || original.icon !== category.icon || original.spending !== category.spending)
  );
}

/** Rename categories, change their icon or whether they count as spending, add new ones and delete those. */
export function CategoryEditor({categories, forStore, onSave, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [draft, setDraft] = useState<Category[]>(categories.list);
  const [added, setAdded] = useState<CategoryKey | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  const update = (key: CategoryKey, change: Partial<Category>) =>
    setDraft(draft.map(category => (category.key === key ? {...category, ...change} : category)));

  /** The list with the category typed in the add row (before Other), if a name is typed. */
  function withTyped(list: Category[]) {
    const label = name.trim();
    if (!label) return {list, key: null};
    const category: Category = {
      key: newCategoryKey(label),
      label,
      icon: icon || DEFAULT_ICON,
      spending: true,
      custom: true,
    };
    const other = list.findIndex(item => item.key === 'other');
    return {list: [...list.slice(0, other), category, ...list.slice(other)], key: category.key};
  }

  function add() {
    const typed = withTyped(draft);
    if (!typed.key) return;
    setDraft(typed.list);
    setAdded(typed.key);
    setName('');
    setIcon('');
  }

  function save() {
    // A name typed but not added yet is added: pressing Save right after typing is the natural move.
    const typed = withTyped(draft);
    // An emptied name or icon goes back to what it was.
    const cleaned = typed.list.map(category => {
      const before = categories.byKey[category.key] ?? category;
      return {...category, label: category.label.trim() || before.label, icon: category.icon.trim() || before.icon};
    });
    const newKey = typed.key ?? added;
    onSave(cleaned, newKey && cleaned.some(category => category.key === newKey) ? newKey : null);
    closeDialog();
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog"
      aria-labelledby="category-editor-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="category-editor-title">Categories</h2>
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">
          {forStore
            ? `Add a category for ${forStore}: it will be picked for all its payments.`
            : 'Rename them, change their icon or add your own. A category that is not spending (like transfers) is left out of the totals.'}
        </p>
      </header>
      <form
        className="category-add"
        onSubmit={event => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="icon-input"
          aria-label="Icon of the new category"
          value={icon}
          placeholder={DEFAULT_ICON}
          onChange={event => setIcon(oneIcon(event.target.value, icon))}
        />
        <input
          className="text-input"
          aria-label="Name of the new category"
          placeholder="New category, like Kids or Gifts"
          value={name}
          maxLength={40}
          autoFocus={Boolean(forStore)}
          onChange={event => setName(event.target.value)}
        />
        <button type="submit" className="button" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <ul className="category-list">
        {draft.map(category => (
          <li key={category.key} className={category.key === added ? 'is-new' : undefined}>
            <input
              className="icon-input"
              aria-label={`Icon of ${category.label}`}
              value={category.icon}
              onChange={event => update(category.key, {icon: oneIcon(event.target.value, category.icon)})}
            />
            <input
              className="text-input"
              aria-label={`Name of ${category.label}`}
              value={category.label}
              maxLength={40}
              onChange={event => update(category.key, {label: event.target.value})}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={category.spending && !LEFT_OUT.includes(category.key)}
                // Money between one's accounts and ignored payments stay out of every total.
                disabled={LEFT_OUT.includes(category.key)}
                onChange={event => update(category.key, {spending: event.target.checked})}
              />
              Counts as spending
            </label>
            {category.custom ? (
              <button
                type="button"
                className="link-button"
                onClick={() => setDraft(draft.filter(item => item.key !== category.key))}
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
                    BUILT_IN.find(item => item.key === category.key)!,
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
        <button type="button" className="button is-quiet" onClick={closeDialog}>
          Cancel
        </button>
        <button type="button" className="button is-primary" onClick={save}>
          Save
        </button>
      </footer>
    </dialog>
  );
}
