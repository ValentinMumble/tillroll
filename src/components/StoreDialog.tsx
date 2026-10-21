import {useMemo, useState} from 'react';
import type {Categories} from '../categories';
import {money} from '../format';
import {periodLabel, shortMonth} from '../periods';
import {type Row, spendByMonth} from '../report';
import type {StoreInfo} from '../duplicates';
import type {CategoryKey, Merges, Rules} from '../types';
import {useDialog} from '../useDialog';
import {BarStrip} from './BarStrip';
import {WebSearch} from './WebSearch';

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
 * One store, opened from its pencil or its name: its name and its category, the stores merged into it (each can be
 * separated again) and look-alike stores to merge in with one tap.
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
          <p className="hint">
            {facts.payments === 1 ? '1 payment' : `${facts.payments} payments`}
            {facts.spent > 0 && ` · ${money(facts.spent, facts.currency)}`}
          </p>
          <ul className="sorter-examples" aria-label="What the bank says">
            {facts.texts.map(text => (
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
        {facts.months.length > 1 && (
          <section className="store-months">
            <BarStrip
              caption={`Month by month: ${money(
                facts.months.reduce((sum, item) => sum + item.total, 0) / facts.months.length,
                facts.currency,
              )} on average`}
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
        {facts.parts.length > 0 && (
          <section className="store-parts">
            <h3>Includes</h3>
            <ul>
              {facts.parts.map(part => (
                <li key={part.key}>
                  {part.name}
                  <button type="button" className="link-button" onClick={() => onSeparate(part.key)}>
                    Separate
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {similar.length > 0 && (
          <section className="store-parts">
            <h3>Looks like</h3>
            <ul>
              {similar.slice(0, 5).map(other => (
                <li key={other.key}>
                  <span>
                    {other.name}{' '}
                    <span className="muted">{other.payments === 1 ? '1 payment' : `${other.payments} payments`}</span>
                  </span>
                  <button type="button" className="link-button" onClick={() => onMergeInto(other.key, store.name)}>
                    Merge into this
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <footer className="dialog-foot">
          <button
            type="button"
            className="link-button store-dialog-more"
            // The store editor takes this dialog's place (closing first would end with no dialog at all).
            onClick={onMore}
          >
            Merge with other stores…
          </button>
          <button type="button" className="button is-quiet" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="button is-primary">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
