import {useMemo, useState} from 'react';
import type {Categories} from '../categories';
import {money} from '../format';
import {dayLabel, periodLabel, shortMonth, today} from '../periods';
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
 * One store, opened from its pencil or its name: what it cost, its name and its category, its month by month, and in
 * folds open at first, what the bank writes, the names merged into it (each can be separated again) and look-alike
 * stores to merge in with one tap. The ✕ closes without saving.
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
    // Its payments' amounts, money out only, smallest first: the middle one is a usual payment.
    const paid = own.filter(row => row.amount < 0).sort((first, second) => second.amount - first.amount);
    return {
      payments: own.length,
      spent: own.reduce((sum, row) => sum + Math.max(0, -row.amount), 0),
      usual: paid.length ? -paid[paid.length >> 1].amount : 0,
      biggestPayment: paid.at(-1) ?? null,
      currency: own[0]?.currency ?? 'EUR',
      guessed: [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] ?? 'other',
      texts: [...new Set(own.map(row => row.description))].slice(0, 3),
      // Month by month, the last 12 months the store was used in at most, months with nothing included.
      months: spendByMonth(own, 12),
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
  // The month it cost the most, of those the chart shows.
  const biggest = facts.months.reduce<(typeof facts.months)[number] | null>(
    (best, item) => (!best || item.total > best.total ? item : best),
    null,
  );

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
              caption={facts.months.length >= 12 ? 'Last 12 months' : 'Month by month'}
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
        {/* Its usual level and its peaks: a month on average and the biggest one (of the chart's), a usual payment and
            the biggest one. Two by two on a phone. */}
        {facts.biggestPayment && (
          <dl className="facts store-facts">
            {facts.months.length > 1 && (
              <div>
                <dt>A month</dt>
                <dd>{money(monthly, facts.currency)}</dd>
              </div>
            )}
            {facts.months.length > 1 && biggest && (
              <div>
                <dt>Biggest month</dt>
                <dd>
                  {money(biggest.total, facts.currency)}{' '}
                  <span className="muted">{periodLabel(biggest.month, 'month')}</span>
                </dd>
              </div>
            )}
            <div>
              <dt>Usually</dt>
              <dd>
                {money(facts.usual, facts.currency)} <span className="muted">a payment</span>
              </dd>
            </div>
            <div>
              <dt>Biggest payment</dt>
              <dd>
                {money(-facts.biggestPayment.amount, facts.currency)}{' '}
                <span className="muted">
                  {dayLabel(facts.biggestPayment.date, facts.biggestPayment.date.slice(0, 4) !== today().slice(0, 4))}
                </span>
              </dd>
            </div>
          </dl>
        )}
        <div className="folds">
          <details className="fold" open>
            <summary>What the bank writes</summary>
            <ul className="sorter-examples">
              {facts.texts.map(text => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </details>
          {facts.parts.length > 0 && (
            <details className="fold" open>
              <summary>Merged from {facts.parts.length === 1 ? '1 name' : `${facts.parts.length} names`}</summary>
              {/* Each name as a chip, its ✕ beside it: it becomes its own store again. */}
              <ul className="name-chips">
                {facts.parts.map(part => (
                  <li key={part.key} className="name-chip">
                    {part.name}
                    <button
                      type="button"
                      aria-label={`Separate ${part.name}`}
                      title="Separate: its own store again"
                      onClick={() => onSeparate(part.key)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {similar.length > 0 && (
            <details className="fold" open>
              <summary>
                Looks like {similar.length === 1 ? '1 other store' : `${Math.min(similar.length, 5)} other stores`}
              </summary>
              <ul className="name-chips">
                {similar.slice(0, 5).map(other => (
                  <li key={other.key} className="name-chip">
                    {other.name} <span className="muted">{paymentCount(other.payments)}</span>
                    <button
                      type="button"
                      className="name-chip-action"
                      aria-label={`Merge ${other.name} into ${store.name}`}
                      onClick={() => onMergeInto(other.key, store.name)}
                    >
                      Merge
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
