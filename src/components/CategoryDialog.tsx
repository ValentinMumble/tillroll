import {useMemo} from 'react';
import type {Categories} from '../categories';
import {money} from '../format';
import {periodLabel, shortMonth} from '../periods';
import {type Row, spendByMonth} from '../rows';
import type {CategoryKey} from '../types';
import {useDialog} from '../useDialog';
import {BarStrip} from './BarStrip';
import {paymentCount} from '../text';

interface Props {
  category: CategoryKey;
  /** The payments of one currency, newest first. */
  rows: Row[];
  categories: Categories;
  currency: string;
  /** The payment list, narrowed to this category. */
  onOpenPayments: () => void;
  /** One of its stores, in the store dialog. */
  onOpenStore: (store: {key: string; name: string}) => void;
  onClose: () => void;
}

/** The stores shown, biggest first, over the last twelve months. */
const TOP_STORES = 5;

/**
 * One category: what it cost month by month (the last 24 months it was used in at most), its monthly average, and
 * where the money went over the last twelve months.
 */
export function CategoryDialog({category, rows, categories, currency, onOpenPayments, onOpenStore, onClose}: Props) {
  const {ref: dialogRef, onKeyDown: onDialogKeyDown, close: closeDialog} = useDialog();
  const details = categories.byKey[category];

  const facts = useMemo(() => {
    const own = rows.filter(row => row.counts && row.category === category);
    const months = spendByMonth(own);
    const since = months.length > 12 ? months[months.length - 12].month : (months[0]?.month ?? '');
    const stores = new Map<string, {key: string; name: string; total: number}>();
    for (const row of own) {
      if (row.date.slice(0, 7) < since) continue;
      const store = stores.get(row.storeKey) ?? {key: row.storeKey, name: row.store, total: 0};
      store.total += row.spend;
      stores.set(row.storeKey, store);
    }
    const yearTotal = [...stores.values()].reduce((sum, store) => sum + store.total, 0);
    return {
      payments: own.filter(row => row.spend > 0).length,
      total: own.reduce((sum, row) => sum + row.spend, 0),
      months,
      since,
      yearTotal,
      stores: [...stores.values()]
        .filter(store => store.total >= 0.5)
        .sort((first, second) => second.total - first.total)
        .slice(0, TOP_STORES),
    };
  }, [rows, category]);
  const average = facts.months.length
    ? facts.months.reduce((sum, item) => sum + item.total, 0) / facts.months.length
    : 0;

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={onDialogKeyDown}
      className="dialog category-dialog"
      aria-labelledby="category-dialog-title"
      onClose={onClose}
    >
      <div className="category-dialog-body">
        <header className="dialog-head">
          <h2 id="category-dialog-title">
            <span aria-hidden="true">{details?.icon}</span> {details?.label ?? category}
          </h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
            ✕
          </button>
          <p className="hint">
            {paymentCount(facts.payments)} · {money(facts.total, currency)} in all
          </p>
        </header>
        {facts.months.length > 1 ? (
          <section className="store-months">
            <BarStrip
              caption={`Month by month: ${money(average, currency)} on average`}
              values={facts.months.map(item => Math.max(0, item.total))}
              // Every third month, counted back from the last one, so the last label never runs into another.
              labels={facts.months.map((item, index) =>
                (facts.months.length - 1 - index) % 3 === 0 ? shortMonth(item.month) : '',
              )}
              titles={facts.months.map(item => periodLabel(item.month, 'month'))}
              currency={currency}
            />
          </section>
        ) : (
          <p className="empty">Not enough months yet for a trend.</p>
        )}
        {facts.stores.length > 0 && (
          <section className="store-parts">
            <h3>Where it went, since {periodLabel(facts.since, 'month')}</h3>
            <ul>
              {facts.stores.map(store => (
                <li key={store.key}>
                  <button type="button" className="link-button" onClick={() => onOpenStore(store)}>
                    {store.name}
                  </button>
                  <span>
                    {money(store.total, currency)}{' '}
                    <span className="muted">
                      {facts.yearTotal > 0 ? `${Math.round((store.total / facts.yearTotal) * 100)}%` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="dialog-foot">
        <button
          type="button"
          className="link-button store-dialog-more"
          onClick={() => {
            onOpenPayments();
            closeDialog();
          }}
        >
          See its payments
        </button>
      </footer>
    </dialog>
  );
}
