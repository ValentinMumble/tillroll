import {useMemo, useState} from 'react';
import type {Categories} from '../categories';
import {money} from '../format';
import {periodLabel, shortMonth} from '../periods';
import {type Row, spendByMonth} from '../rows';
import type {StoreInfo} from '../duplicates';
import type {CategoryKey, Merges, Rules} from '../types';
import {useDialog} from '../useDialog';
import {BarStrip} from './BarStrip';
import {WebSearch} from './WebSearch';
import {paymentCount} from '../text';

interface Props {
  store: {key: string; name: string};
  rows: Row[];
  rules: Rules;
  categories: Categories;
  onSave: (newName: string, category: CategoryKey | null) => void;
  /** Opens the full store editor, to merge this store with others. */
  onMore: () => void;
  merges: Merges;
  /** Look-alike stores (names sharing a rare word), from the duplicates finder. */
  similar: StoreInfo[];
  onSeparate: (storeKey: string) => void;
  onMergeInto: (storeKey: string, into: string) => void;
  onClose: () => void;
}

/**
 * One store, opened from its pencil or its name: what it cost, its name and its category, its month by month, and
 * folded away until asked for, what the bank writes, the names merged into it (each can be separated again) and
 * look-alike stores to merge in with one tap. The ✕ closes without saving.
 */
export function StoreDialog({
  store,
  rows,
  rules,
  categories,
  onSave,
  onMore,
  merges,
  similar,
  onSeparate,
  onMergeInto,
  onClose,
}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const picked = rules[store.key] && categories.byKey[rules[store.key]] ? rules[store.key] : '';
  const [name, setName] = useState(store.name);
  const [category, setCategory] = useState<CategoryKey>(picked);

  const facts = useMemo(() => {
    const own = rows.filter(row => row.storeKey === store.key);
    const counts = new Map<CategoryKey, number>();
    for (const row of own) counts.set(row.guessed, (counts.get(row.guessed) ?? 0) + 1);
    return {
      payments: own.length,
      spent: own.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
      currency: own[0]?.currency ?? 'EUR',
      guessed: [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] ?? 'other',
      texts: [...new Set(own.map(row => row.description))].slice(0, 3),
      // Month by month, the last 24 months the store was used in at most, months with nothing included.
      months: spendByMonth(own),
      // The stores merged into this one: their own names, before the merge.
      parts: [...new Map(own.filter(row => row.ownStoreKey !== store.key).map(row => [row.ownStoreKey, row.ownStore]))]
        .filter(([key]) => merges[key])
        .map(([key, name]) => ({key, name})),
    };
  }, [rows, store.key, merges]);
  const auto = categories.byKey[facts.guessed];
  const monthly = facts.months.length
    ? facts.months.reduce((sum, item) => sum + item.total, 0) / facts.months.length
    : 0;

  function save() {
    const newName = name.trim() || store.name;
    if (newName !== store.name || category !== picked) onSave(newName, category || null);
    closeDialog();
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog store-dialog"
      aria-labelledby="store-dialog-title"
      onClose={onClose}
    >
      <form
        className="store-dialog-form"
        onSubmit={event => {
          event.preventDefault();
          save();
        }}
      >
        <header className="dialog-head">
          <h2 id="store-dialog-title">
            {store.name} <WebSearch name={store.name} />
          </h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
            ✕
          </button>
          <p className="hint">
            {paymentCount(facts.payments)}
            {facts.spent > 0 && ` · ${money(facts.spent, facts.currency)}`}
            {facts.months.length > 1 && monthly >= 0.5 && ` · ${money(monthly, facts.currency)} a month`}
          </p>
        </header>
        <div className="store-fields">
          <label className="field">
            Name
            <input
              className="text-input"
              value={name}
              maxLength={80}
              autoFocus
              onFocus={event => event.target.select()}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Category
            <select className="select" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">
                {auto?.icon} {auto?.label} (auto)
              </option>
              {categories.alphabetical.map(item => (
                <option key={item.key} value={item.key}>
                  {item.icon} {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {facts.months.length > 1 && (
          <section className="store-months">
            <BarStrip
              caption="Month by month"
              values={facts.months.map(item => Math.max(0, item.total))}
              // Every third month, counted back from the last one, so the last label never runs into another.
              labels={facts.months.map((item, index) =>
                (facts.months.length - 1 - index) % 3 === 0 ? shortMonth(item.month) : '',
              )}
              titles={facts.months.map(item => periodLabel(item.month, 'month'))}
              currency={facts.currency}
            />
          </section>
        )}
        <div className="folds">
          <details className="fold">
            <summary>What the bank writes</summary>
            <ul className="sorter-examples">
              {facts.texts.map(text => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </details>
          {facts.parts.length > 0 && (
            <details className="fold">
              <summary>Merged from {facts.parts.length === 1 ? '1 name' : `${facts.parts.length} names`}</summary>
              <ul className="fold-list">
                {facts.parts.map(part => (
                  <li key={part.key}>
                    {part.name}
                    <button type="button" className="link-button" onClick={() => onSeparate(part.key)}>
                      Separate
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {similar.length > 0 && (
            <details className="fold">
              <summary>
                Looks like {similar.length === 1 ? '1 other store' : `${Math.min(similar.length, 5)} other stores`}
              </summary>
              <ul className="fold-list">
                {similar.slice(0, 5).map(other => (
                  <li key={other.key}>
                    <span>
                      {other.name} <span className="muted">{paymentCount(other.payments)}</span>
                    </span>
                    <button type="button" className="link-button" onClick={() => onMergeInto(other.key, store.name)}>
                      Merge into this
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <footer className="dialog-foot">
          <button
            type="button"
            className="link-button store-dialog-more"
            // The store editor takes this dialog's place (closing first would end with no dialog at all).
            onClick={onMore}
          >
            Merge with other stores…
          </button>
          <button type="submit" className="button is-primary">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
