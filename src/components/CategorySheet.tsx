import {useState} from 'react';
import {type Categories, DEFAULT_ICON, oneIcon} from '../categories';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';

export interface Scope {
  key: string;
  label: string;
}

interface Props {
  title: string;
  detail: string;
  /** Where the choice applies, the first one picked to start with. */
  scopes: Scope[];
  categories: Categories;
  /** The category now, outlined. */
  current: CategoryKey | null;
  onPick: (category: CategoryKey | null, scope: string) => void;
  onCreate: (label: string, icon: string, scope: string) => void;
  onClose: () => void;
}

/** Pick a category for one payment or several: first where it applies (these payments, or their stores), then which. */
export function CategorySheet({title, detail, scopes, categories, current, onPick, onCreate, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [scope, setScope] = useState(scopes[0].key);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  function pick(category: CategoryKey | null) {
    onPick(category, scope);
    closeDialog();
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog category-sheet"
      aria-labelledby="category-sheet-title"
      onClose={onClose}
    >
      <header className="dialog-head">
        <h2 id="category-sheet-title">{title}</h2>
        <p className="hint">{detail}</p>
      </header>
      <fieldset className="scopes">
        <legend className="visually-hidden">Apply to</legend>
        {scopes.map(item => (
          <label key={item.key} className={`scope${scope === item.key ? ' is-on' : ''}`}>
            <input type="radio" name="scope" checked={scope === item.key} onChange={() => setScope(item.key)} />
            {item.label}
          </label>
        ))}
      </fieldset>
      <div className="sheet-body">
        <div className="chip-grid" role="group" aria-label="Category">
          {categories.alphabetical.map(category => (
            <button
              key={category.key}
              type="button"
              className={`category-chip${current === category.key ? ' is-current' : ''}`}
              aria-pressed={current === category.key}
              onClick={() => pick(category.key)}
            >
              <span aria-hidden="true">{category.icon}</span>
              {category.label}
            </button>
          ))}
        </div>
        <form
          className="category-add"
          onSubmit={event => {
            event.preventDefault();
            if (!name.trim()) return;
            onCreate(name.trim(), icon || DEFAULT_ICON, scope);
            closeDialog();
          }}
        >
          <input
            className="icon-input"
            aria-label="Icon of the new category"
            placeholder={DEFAULT_ICON}
            value={icon}
            onChange={event => setIcon(oneIcon(event.target.value, icon))}
          />
          <input
            className="text-input"
            aria-label="New category"
            placeholder="Or a new category"
            value={name}
            maxLength={40}
            onChange={event => setName(event.target.value)}
          />
          <button type="submit" className="button" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </div>
      <footer className="dialog-foot">
        <button type="button" className="link-button sheet-auto" onClick={() => pick(null)}>
          Back to automatic
        </button>
        <button type="button" className="button is-quiet" onClick={closeDialog}>
          Cancel
        </button>
      </footer>
    </dialog>
  );
}
