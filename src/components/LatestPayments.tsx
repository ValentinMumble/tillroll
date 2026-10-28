import {useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {dayLabel, recentDayLabel} from '../periods';
import {isListed, isIncoming, isUnsure, type Row, topCategories} from '../rows';
import {loadPaymentsEverything, loadPaymentsOwn} from '../storage';
import type {CategoryKey, Labels} from '../types';
import {BankBadge} from './BankBadge';
import {CategorySheet} from './CategorySheet';
import {ListSwitches} from './ListSwitches';
import {LabelOptions, PaymentLabels} from './PaymentLabels';
import {PaybackPicker} from './PaybackPicker';
import {opensCategory} from '../device';

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
  /** The store's dialog, from its name. */
  onOpenStore: (store: {key: string; name: string}) => void;
  /** Every payment in this currency, from every period: money in may pay back a payment of an earlier month. */
  allRows: Row[];
  /** Money in linked to the payment it pays back; null takes the link off. */
  onPayback: (row: Row, paymentId: string | null) => void;
}

/** The overview shows whole days: at least this many payments, and at least this many days. */
const SHOWN = 8;
const DAYS = 3;

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
  onOpenStore,
  allRows,
  onPayback,
}: Props) {
  const [sheet, setSheet] = useState<Row | null>(null);
  // The same choices as the payment list's, remembered in each browser.
  const [moneyIn, setMoneyIn] = useState(loadPaymentsEverything);
  const [own, setOwn] = useState(loadPaymentsOwn);
  const shown = rows.filter(row => isListed(row, {moneyIn, own}));
  // Newest first, a day at a time, until there are enough days and enough payments.
  const latest: Row[] = [];
  const days = new Set<string>();
  for (const row of shown) {
    if (!days.has(row.date) && days.size >= DAYS && latest.length >= SHOWN) break;
    latest.push(row);
    days.add(row.date);
  }
  const moves = rows.filter(row => row.category === 'own').length;
  // What went out each day, over every listed payment of the day, not only the ones shown.
  const dayTotals = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  for (const row of shown) {
    dayCounts.set(row.date, (dayCounts.get(row.date) ?? 0) + 1);
    if (row.amount < 0 && !row.leftOut) dayTotals.set(row.date, (dayTotals.get(row.date) ?? 0) - row.amount);
  }
  return (
    <section className="card is-preview latest">
      <header className="card-head">
        <h2>Latest payments</h2>
        <ListSwitches moneyIn={moneyIn} own={own} moves={moves} onMoneyIn={setMoneyIn} onOwn={setOwn} />
        {shown.length > latest.length && (
          <button type="button" className="link-button" onClick={onSeeAll}>
            All {shown.length} payments →
          </button>
        )}
      </header>
      {latest.length === 0 ? (
        <p className="empty">No payments in this period.</p>
      ) : (
        <ul>
          {latest.map((row, index) => {
            const category = categories.byKey[row.category];
            return [
              // A heading above each day's payments, as in the payment list.
              row.date !== latest[index - 1]?.date && (
                <li key={`day-${row.date}`} className="latest-day-head">
                  <h3>{recentDayLabel(row.date)}</h3>
                  <span className="payment-amount">
                    {/* A day with one payment already shows its amount on the row. */}
                    {(dayCounts.get(row.date) ?? 0) > 1 && dayTotals.get(row.date)
                      ? money(-(dayTotals.get(row.date) ?? 0), row.currency, true)
                      : ''}
                  </span>
                </li>
              ),
              <li
                key={row.id}
                // Faded like in the payment list: not spending, or nothing spent in the end (€0, refunded in full).
                className={(row.counts && row.spend !== 0) || isIncoming(row) ? undefined : 'is-muted'}
                onClick={event => {
                  if (opensCategory(event)) setSheet(row);
                }}
              >
                <span className="latest-store">
                  {showBanks && <BankBadge bank={row.bank} />}
                  <button
                    type="button"
                    className="payment-store-name latest-name"
                    title={`${row.description}\nRename ${row.store} or change its category`}
                    onClick={() => onOpenStore({key: row.storeKey, name: row.store})}
                  >
                    {row.store}
                  </button>
                  {row.pending && <span className="tag">pending</span>}
                  <PaymentLabels row={row} onLabels={onLabels} onFocusLabel={onFocusLabel} />
                </span>
                <span className="latest-day">{row.time}</span>
                <button
                  type="button"
                  className={`category-button${row.basis === 'picked' ? '' : ' is-auto'}${
                    isUnsure(row) ? ' is-unsure' : ''
                  }`}
                  style={colourStyle(categories.colours[row.category])}
                  aria-label={`Category of this payment at ${row.store}: ${category?.label}. Change it`}
                  onClick={() => setSheet(row)}
                >
                  <span className="category-button-icon" aria-hidden="true">
                    {category?.icon}
                  </span>
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
              </li>,
            ];
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
          payback={
            sheet.amount > 0 && (
              <PaybackPicker
                row={rows.find(row => row.id === sheet.id) ?? sheet}
                rows={allRows}
                onLink={paymentId => {
                  onPayback(sheet, paymentId);
                  setSheet(null);
                }}
              />
            )
          }
          labels={
            <PaymentLabels
              // The payment as it is now: labels added in the sheet show at once.
              row={rows.find(row => row.id === sheet.id) ?? sheet}
              onLabels={onLabels}
              onFocusLabel={label => {
                setSheet(null);
                onFocusLabel(label);
              }}
            />
          }
          onPick={(category, scope) => onCategorize([sheet], category, scope)}
          onCreate={(label, icon, scope) => onCreateCategory([sheet], label, icon, scope)}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
