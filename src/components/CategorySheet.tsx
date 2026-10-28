import {type ReactNode, useState} from 'react';
import {type Categories, colourStyle, DEFAULT_ICON, oneIcon} from '../categories';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';

export interface Scope {
  key: string;
  label: string;
  /** What the choice changes, said in full under the switch. */
  hint: string;
}

interface Props {
  title: string;
  detail: string;
  /** Where the choice applies, the first one picked to start with: two, side by side. */
  scopes: Scope[];
  categories: Categories;
  /** The category now, outlined. */
  current: CategoryKey | null;
  /** The category now is Tillroll's guess: it can be kept as it is, and it is outlined dashed. */
  guess: boolean;
  /** The categories used most, offered first. */
  frequent: CategoryKey[];
  /** One payment's labels, to add or take off here (a phone has no label button on each row). */
  labels?: ReactNode;
  /** For money in: the payment it pays back, to pick or unlink (see PaybackPicker). */
  payback?: ReactNode;
  onPick: (category: CategoryKey | null, scope: string) => void;
  onCreate: (label: string, icon: string, scope: string) => void;
  onClose: () => void;
}

/**
 * Pick a category for one payment or several: where it applies (these payments, or their stores), then which, the
 * ones used most first, each in its colour. A guess can be kept as it is, or a new category made.
 */
export function CategorySheet({
  title,
  detail,
  scopes,
  categories,
  current,
  guess,
  frequent,
  labels,
  payback,
  onPick,
  onCreate,
  onClose,
}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const [scope, setScope] = useState(scopes[0].key);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const often = frequent.filter(key => key !== current && categories.byKey[key]).slice(0, 3);

  function pick(category: CategoryKey | null) {
    onPick(category, scope);
    closeDialog();
  }

  function categoryButton(key: CategoryKey, big = false) {
    const category = categories.byKey[key];
    const isCurrent = current === key;
    return (
      <button
        key={key}
        type="button"
        className={`category-chip${big ? ' is-big' : ''}${isCurrent ? (guess ? ' is-guess' : ' is-current') : ''}`}
        aria-pressed={isCurrent}
        style={colourStyle(categories.colours[key])}
        onClick={() => pick(key)}
      >
        <span aria-hidden="true">{category.icon}</span>
        {category.label}
      </button>
    );
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
        <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
          ✕
        </button>
        <p className="hint">{detail}</p>
      </header>
      <div className="sheet-body">
        <div className="sheet-scope">
          <div className="scope-switch" role="group" aria-label="Apply to">
            {scopes.map(item => (
              <button key={item.key} type="button" aria-pressed={scope === item.key} onClick={() => setScope(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="hint">{scopes.find(item => item.key === scope)?.hint}</p>
        </div>
        {labels && (
          <section className="sheet-group" aria-labelledby="sheet-labels">
            <h3 id="sheet-labels">Labels</h3>
            <div className="sheet-labels">{labels}</div>
          </section>
        )}
        {payback && (
          <section className="sheet-group" aria-labelledby="sheet-payback">
            <h3 id="sheet-payback">Pays back</h3>
            {payback}
          </section>
        )}
        {often.length > 0 && (
          <section className="sheet-group" aria-labelledby="sheet-often">
            <h3 id="sheet-often">Most used</h3>
            <div className="sheet-often">{often.map(key => categoryButton(key, true))}</div>
          </section>
        )}
        <section className="sheet-group" aria-labelledby="sheet-all">
          <h3 id="sheet-all">All categories</h3>
          <div className="chip-grid">{categories.alphabetical.map(category => categoryButton(category.key))}</div>
          {!adding && (
            <button type="button" className="link-button sheet-new" onClick={() => setAdding(true)}>
              + New category
            </button>
          )}
        </section>
        {adding && (
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
              placeholder="Its name"
              value={name}
              maxLength={40}
              autoFocus
              onChange={event => setName(event.target.value)}
            />
            <button type="submit" className="button" disabled={!name.trim()}>
              Add
            </button>
          </form>
        )}
      </div>
      <footer className="dialog-foot">
        {guess && current ? (
          <button type="button" className="button sheet-auto" onClick={() => pick(current)}>
            Keep the guess
          </button>
        ) : (
          <button type="button" className="link-button sheet-auto" onClick={() => pick(null)}>
            Back to automatic
          </button>
        )}
      </footer>
    </dialog>
  );
}
