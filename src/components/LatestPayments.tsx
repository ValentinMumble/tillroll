import {useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {dayLabel, weekdayLabel} from '../periods';
import {isUnsure, type Row, topCategories} from '../report';
import {loadPaymentsEverything, savePaymentsEverything} from '../storage';
import type {CategoryKey, Labels} from '../types';
import {BankBadge} from './BankBadge';
import {CategorySheet} from './CategorySheet';
import {LabelOptions, PaymentLabels} from './PaymentLabels';

interface Props {
  /** The period's payments, newest first. */
  rows: Row[];
  categories: Categories;
  onSeeAll: () => void;
  /** The category of a payment, for its store or for this payment only (scope "store" or "payment"). */
  onCategorize: (rows: Row[], category: CategoryKey | null, scope: string) => void;
  onCreateCategory: (rows: Row[], label: string, icon: string, scope: string) => void;
  /** The payments come from more than one bank: each shows its bank's letter. */
  showBanks: boolean;
  /** Every label in use, offered while typing one. */
  labelNames: string[];
  /** Each changed payment's full list of labels. */
  onLabels: (changes: Labels) => void;
  onFocusLabel: (label: string) => void;
}

const SHOWN = 6;

/** The overview's last few payments of the period, each with its category to change, and the way to the full list. */
export function LatestPayments({
  rows,
  categories,
  onSeeAll,
  onCategorize,
  onCreateCategory,
  showBanks,
  labelNames,
  onLabels,
  onFocusLabel,
}: Props) {
  const [sheet, setSheet] = useState<Row | null>(null);
  // The same choice as the payment list's, remembered in each browser.
  const [everything, setEverything] = useState(loadPaymentsEverything);
  const shown = everything ? rows : rows.filter(row => row.counts);
  const latest = shown.slice(0, SHOWN);
  return (
    <section className="card is-preview latest">
      <header className="card-head">
        <h2>Latest payments</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={everything}
            onChange={event => {
              setEverything(event.target.checked);
              savePaymentsEverything(event.target.checked);
            }}
          />
          Show transfers and money in
        </label>
        {shown.length > SHOWN && (
          <button type="button" className="link-button" onClick={onSeeAll}>
            All {shown.length} payments →
          </button>
        )}
      </header>
      {latest.length === 0 ? (
        <p className="empty">No payments in this period.</p>
      ) : (
        <ul>
          {latest.map(row => {
            const category = categories.byKey[row.category];
            return (
              <li key={row.id} className={row.counts ? undefined : 'is-muted'}>
                <span className="latest-store">
                  {showBanks && <BankBadge bank={row.bank} />}
                  <span className="latest-name">{row.store}</span>
                  {row.pending && <span className="tag">pending</span>}
                  <PaymentLabels row={row} onLabels={onLabels} onFocusLabel={onFocusLabel} />
                </span>
                <span className="latest-day">
                  {weekdayLabel(row.date)}
                  {row.time && ` ${row.time}`}
                </span>
                <button
                  type="button"
                  className={`category-button${row.basis === 'picked' ? '' : ' is-auto'}${
                    isUnsure(row) ? ' is-unsure' : ''
                  }`}
                  style={colourStyle(categories.colours[row.category])}
                  aria-label={`Category of this payment at ${row.store}: ${category?.label}. Change it`}
                  onClick={() => setSheet(row)}
                >
                  <span className="cat-dot" aria-hidden="true" />
                  <span className="category-button-label">{category?.label}</span>
                  {row.ownCategory && (
                    <span className="own-mark" title="Picked for this payment only">
                      •
                    </span>
                  )}
                </button>
                <span className={`payment-amount${row.amount > 0 ? ' is-in' : ''}`}>
                  {money(row.amount, row.currency, true)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {latest.length > 0 && <LabelOptions names={labelNames} />}
      {sheet && (
        <CategorySheet
          title={sheet.store}
          detail={`${dayLabel(sheet.date, true)} · ${money(sheet.amount, sheet.currency, true)}`}
          scopes={[
            {key: 'store', label: 'Whole store', hint: `Every payment at ${sheet.store}, past and future`},
            {
              key: 'payment',
              label: 'This payment',
              hint: `This payment only: the others at ${sheet.store} keep theirs`,
            },
          ]}
          categories={categories}
          current={sheet.category}
          guess={sheet.basis !== 'picked'}
          frequent={topCategories(rows, 4)}
          onPick={(category, scope) => onCategorize([sheet], category, scope)}
          onCreate={(label, icon, scope) => onCreateCategory([sheet], label, icon, scope)}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
