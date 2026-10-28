import {useEffect, useRef, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {tidyLabel, withLabel} from '../labels';
import {dayLabel, recentDayLabel, today} from '../periods';
import {bankOf, isListed, isIncoming, isUnsure, paidBackIds, type Row, searchText, topCategories} from '../rows';
import {
  loadPaymentSort,
  loadPaymentsEverything,
  loadPaymentsOwn,
  type PaymentSort,
  savePaymentSort,
  savePaymentsEverything,
  savePaymentsOwn,
} from '../storage';
import type {CategoryKey, Labels} from '../types';
import {BankBadge} from './BankBadge';
import type {Focus} from './Breakdown';
import {CategoryFilter} from './CategoryFilter';
import {CategorySheet, type Scope} from './CategorySheet';
import {ListSwitches} from './ListSwitches';
import {LabelOptions, PaymentLabels} from './PaymentLabels';
import {PaybackPicker} from './PaybackPicker';
import {RefundTags} from './RefundTags';
import {WebSearch} from './WebSearch';
import {paymentCount, plain} from '../text';
import {opensCategory} from '../device';

interface Props {
  rows: Row[];
  /** Every period's payments in this currency: a search tells how many match outside the period. */
  allRows: Row[];
  /** Shows every period, for the matches outside this one. */
  onAllTime: () => void;
  categories: Categories;
  focus: Focus | null;
  onClearFocus: () => void;
  /** The category of some payments, for their stores or for these payments only (scope "store" or "payment"). */
  onCategorize: (rows: Row[], category: CategoryKey | null, scope: string) => void;
  onCreateCategory: (rows: Row[], label: string, icon: string, scope: string) => void;
  /** Opens the store editor on this store. */
  onEditStore: (storeKey: string) => void;
  /** Opens one store's dialog (name and category). */
  onOpenStore: (store: {key: string; name: string}) => void;
  /** Every label in use, offered while typing one. */
  labelNames: string[];
  /** Each changed payment's full list of labels. */
  onLabels: (changes: Labels) => void;
  onFocusLabel: (label: string) => void;
  /** The category filter above the list, several at once; none shows every category. */
  onFocusCategories: (keys: CategoryKey[]) => void;
  /** Shows the payments to check only. */
  onFocusCheck: () => void;
  /** Money in linked to the payment it pays back; null takes the link off. */
  onPayback: (row: Row, paymentId: string | null) => void;
  /** The payments come from more than one bank: each shows its bank's letter. */
  showBanks: boolean;
}

const PAGE = 60;

/** The sort buttons, with the way each one starts: newest, biggest, A to Z. */
const SORTS: {key: PaymentSort['key']; label: string; descending: boolean}[] = [
  {key: 'date', label: 'Date', descending: true},
  {key: 'amount', label: 'Amount', descending: true},
  {key: 'store', label: 'Store', descending: false},
];

function compare(first: Row, second: Row, {key, descending}: PaymentSort) {
  // The day, then the time when both have one (statements give it, the bank sync does not).
  const firstMoment = `${first.date} ${first.time ?? ''}`;
  const secondMoment = `${second.date} ${second.time ?? ''}`;
  const byDate = firstMoment < secondMoment ? -1 : firstMoment > secondMoment ? 1 : 0;
  const order =
    key === 'amount'
      ? Math.abs(first.amount) - Math.abs(second.amount)
      : key === 'store'
        ? first.store.localeCompare(second.store, 'en', {sensitivity: 'base'})
        : byDate;
  // Ties (same store, same amount) stay newest first.
  return (descending ? -order : order) || -byDate;
}

/**
 * The period's payments, by date, amount or store, with a search and a category filter. A payment's category is a
 * button: it asks whether the choice is for its store (every payment there) or for this payment only. Ticking
 * payments (shift-click for a run) gives one category or one label to all of them.
 */
export function Payments({
  rows,
  allRows,
  onAllTime,
  categories,
  focus,
  onClearFocus,
  onCategorize,
  onCreateCategory,
  onEditStore,
  onOpenStore,
  labelNames,
  onLabels,
  onFocusLabel,
  onFocusCategories,
  onFocusCheck,
  onPayback,
  showBanks,
}: Props) {
  const [moneyIn, setMoneyIn] = useState(loadPaymentsEverything);
  const [own, setOwn] = useState(loadPaymentsOwn);
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<PaymentSort>(loadPaymentSort);
  const [query, setQuery] = useState('');
  // One bank's payments only; null shows every bank's.
  const [bank, setBank] = useState<string | null>(null);
  // Ticked payments, the last one ticked (for shift-click runs), and the label typed for them.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lastPicked, setLastPicked] = useState<string | null>(null);
  const [pickedLabel, setPickedLabel] = useState('');
  // The payments the category sheet is open for.
  const [sheet, setSheet] = useState<Row[] | null>(null);
  // Only the payments to check; one fixed leaves the list.
  const toCheck = focus?.type === 'check';
  const unsure = rows.filter(isUnsure).length;

  // An amount searched for can carry its sign or its currency ("-448,80 €").
  const words = plain(query)
    .split(/\s+/)
    .map(word => word.replace(/^[-+−]|€/g, ''))
    .filter(Boolean);
  const matches = (row: Row) => {
    const text = searchText(row);
    return words.every(word => text.includes(word));
  };
  const inFocus = (row: Row) => {
    if (bank && bankOf(row) !== bank) return false;
    if (toCheck && !isUnsure(row)) return false;
    if (focus?.type === 'category' && !focus.keys.includes(row.category)) return false;
    if (focus?.type === 'label' && !row.labels.some(label => label.toLowerCase() === focus.key.toLowerCase())) {
      return false;
    }
    return focus?.type !== 'store' || row.storeKey === focus.key;
  };
  // A category picked in the filter shows its payments, even the ones that are not spending.
  const switchedOn = (row: Row) => isListed(row, {moneyIn, own}) || focus?.type === 'category' || toCheck;
  const visible = rows
    .filter(row => inFocus(row) && switchedOn(row) && matches(row))
    .sort((first, second) => compare(first, second, sort));
  // A search also counts the matches the switches, the category filter and the period leave out.
  const found = words.length ? rows.filter(matches) : [];
  const hiddenBySwitch = found.filter(row => inFocus(row) && !switchedOn(row));
  const hidden = {
    moneyIn: hiddenBySwitch.filter(row => row.category !== 'own').length,
    own: hiddenBySwitch.filter(row => row.category === 'own').length,
    category:
      focus?.type === 'category'
        ? found.filter(row => !focus.keys.includes(row.category) && isListed(row, {moneyIn, own})).length
        : 0,
    period: 0,
  };
  if (words.length) {
    const here = new Set(rows.map(row => row.id));
    hidden.period = allRows.filter(
      row => !here.has(row.id) && inFocus(row) && isListed(row, {moneyIn, own}) && matches(row),
    ).length;
  }
  // By date, the list reads like a bank statement: a heading per day, with what went out that day.
  const byDay = sort.key === 'date';
  // The totals of what is listed: they follow the filters and the search.
  const currency = rows[0]?.currency ?? 'EUR';
  const spent = visible.reduce((sum, row) => sum + row.spend, 0);
  // A payment counts when it cost something (a refund, or one refunded in full, does not); in a category that is not
  // spending (transfers, money in), every one counts. The header and the category filter count the same way.
  const counted = (row: Row) => (categories.byKey[row.category]?.spending === false ? true : row.spend > 0);
  const paid = visible.filter(counted).length;
  const movedOut = visible.reduce(
    (sum, row) => sum + (!row.counts && !row.leftOut && row.amount < 0 ? -row.amount : 0),
    0,
  );
  const cameIn = visible.reduce(
    (sum, row) => sum + (!row.counts && !row.leftOut && row.amount > 0 ? row.amount : 0),
    0,
  );
  // The payments some money in was linked to by hand: theirs is paid back, not refunded.
  const paidBack = paidBackIds(allRows);
  // Moves between one's own accounts are in no total: their switch counts the period's.
  const moves = rows.filter(row => row.category === 'own').length;
  const page = visible.slice(0, limit);
  // The next payments come in as the end of the list nears (a screen ahead), so a long period stays quick to draw.
  const moreRef = useRef<HTMLDivElement>(null);
  const hasMore = visible.length > limit;
  useEffect(() => {
    const end = moreRef.current;
    if (!end || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setLimit(shown => shown + PAGE * 2);
      },
      {rootMargin: '800px 0px'},
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasMore, limit]);
  // A time column only when some payments listed have a time (statements give one, the bank sync does not).
  const withTimes = page.some(row => row.time);
  // Dates carry their year when the list covers more than one (all time, a label), or another year than this one.
  const years = new Set(visible.map(row => row.date.slice(0, 4)));
  const withYears = years.size > 1 || (years.size === 1 && !years.has(today().slice(0, 4)));
  const dayTotals = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  // What each day spent by category, for the strip of colours beside its heading.
  const dayParts = new Map<string, Map<CategoryKey, number>>();
  for (const row of visible) {
    dayCounts.set(row.date, (dayCounts.get(row.date) ?? 0) + 1);
    if (row.amount < 0 && !row.leftOut) dayTotals.set(row.date, (dayTotals.get(row.date) ?? 0) - row.amount);
    if (row.spend > 0) {
      const parts = dayParts.get(row.date) ?? new Map<CategoryKey, number>();
      parts.set(row.category, (parts.get(row.category) ?? 0) + row.spend);
      dayParts.set(row.date, parts);
    }
  }
  // Every category with payments, with their number: picking one shows them all.
  // The filters' counts: each category's within the bank picked, each bank's in the whole period.
  const categoryCounts = new Map<CategoryKey, number>();
  const bankCounts = new Map<string, number>();
  for (const row of rows) {
    bankCounts.set(bankOf(row), (bankCounts.get(bankOf(row)) ?? 0) + (counted(row) ? 1 : 0));
    if (bank && bankOf(row) !== bank) continue;
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + (counted(row) ? 1 : 0));
  }
  const selection = visible.filter(row => picked.has(row.id));
  const allIgnored = selection.length > 0 && selection.every(row => row.category === 'ignored');
  const allPicked = visible.length > 0 && selection.length === visible.length;

  /** A new sort starts its own way; the same one again turns it around. */
  function sortBy(key: PaymentSort['key']) {
    const start = SORTS.find(item => item.key === key)!;
    const next = {key, descending: key === sort.key ? !sort.descending : start.descending};
    setSort(next);
    savePaymentSort(next);
  }

  /** Ticks or unticks a payment; with shift, the whole run from the last one ticked. */
  function pick(row: Row, run: boolean) {
    const next = new Set(picked);
    const on = !next.has(row.id);
    const from = lastPicked ? page.findIndex(item => item.id === lastPicked) : -1;
    const to = page.findIndex(item => item.id === row.id);
    if (run && from >= 0 && to >= 0) {
      for (const item of page.slice(Math.min(from, to), Math.max(from, to) + 1)) {
        if (on) next.add(item.id);
        else next.delete(item.id);
      }
    } else if (on) next.add(row.id);
    else next.delete(row.id);
    setPicked(next);
    setLastPicked(row.id);
  }

  function labelPicked() {
    const label = tidyLabel(pickedLabel);
    if (!label || selection.length === 0) return;
    onLabels(Object.fromEntries(selection.map(row => [row.id, withLabel(row.labels, label)])));
    setPickedLabel('');
  }

  // The category sheet: where the choice applies, and what it shows.
  const sheetStores = sheet ? [...new Set(sheet.map(row => row.store))] : [];
  const scopes: Scope[] = !sheet
    ? []
    : sheet.length === 1
      ? [
          {key: 'store', label: 'Whole store', hint: `Every payment at ${sheet[0].store}, past and future`},
          {
            key: 'payment',
            label: 'This payment',
            hint: `This payment only: the others at ${sheet[0].store} keep theirs`,
          },
        ]
      : [
          {key: 'payment', label: `Only these ${sheet.length}`, hint: `These ${sheet.length} payments only`},
          {
            key: 'store',
            label: sheetStores.length === 1 ? 'Whole store' : 'Their stores',
            hint:
              sheetStores.length === 1
                ? `Every payment at ${sheetStores[0]}, past and future`
                : `Every payment at these ${sheetStores.length} stores, past and future`,
          },
        ];
  const sheetCategories = sheet ? new Set(sheet.map(row => row.category)) : new Set<CategoryKey>();

  const focusLabel = focus?.type === 'label' ? `# ${focus.key}` : focus?.type === 'store' ? focus.name : null;

  return (
    <section className="card payments">
      <header className="card-head">
        <h2>Payments</h2>
        <span className="view-total">{money(spent, currency)}</span>
        <span className="hint">
          {paymentCount(paid)}
          {moneyIn && (movedOut > 0 || cameIn > 0) && (
            <>
              {' '}
              · {money(movedOut, currency)} moved out · {money(cameIn, currency)} in
            </>
          )}
          {focus?.type === 'label' && ' · all time'}
        </span>
        {focusLabel && (
          <button type="button" className="chip" aria-label={`Remove the filter ${focusLabel}`} onClick={onClearFocus}>
            {focusLabel} <span aria-hidden="true">✕</span>
          </button>
        )}
        {focus?.type === 'store' && (
          <button type="button" className="link-button" onClick={() => onEditStore(focus.key)}>
            Rename or merge
          </button>
        )}
        <div className="segmented is-small" role="group" aria-label="Sort payments by">
          {SORTS.map(item => {
            const active = sort.key === item.key;
            const way =
              item.key === 'store' ? (sort.descending ? 'Z to A' : 'A to Z') : sort.descending ? 'down' : 'up';
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                aria-label={active ? `${item.label}, ${way}` : item.label}
                onClick={() => sortBy(item.key)}
              >
                {item.label}
                {active && <span aria-hidden="true">{sort.descending ? ' ↓' : ' ↑'}</span>}
              </button>
            );
          })}
        </div>
        <ListSwitches moneyIn={moneyIn} own={own} moves={moves} onMoneyIn={setMoneyIn} onOwn={setOwn} />
      </header>
      <div className="payments-filters">
        <label className="pick-all" title={allPicked ? 'Untick all' : `Tick all ${visible.length}`}>
          <input
            type="checkbox"
            aria-label={allPicked ? 'Untick all payments' : `Tick all ${visible.length} payments`}
            checked={allPicked}
            onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map(row => row.id)))}
          />
        </label>
        <input
          className="text-input"
          type="search"
          aria-label="Search payments"
          placeholder="Search a store, the bank's text, a label or an amount"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setLimit(PAGE);
          }}
        />
        {(unsure > 0 || toCheck) && (
          <button
            type="button"
            className={`chip to-check${toCheck ? ' is-on' : ''}`}
            aria-pressed={toCheck}
            title="The payments whose category Tillroll guessed with little to go on"
            onClick={() => {
              if (toCheck) onClearFocus();
              else onFocusCheck();
              setLimit(PAGE);
            }}
          >
            {unsure} to check
            {toCheck && <span aria-hidden="true">✕</span>}
          </button>
        )}
        {/* The category and the bank: side by side on a phone, under the search. */}
        <div className="payments-selects">
          <CategoryFilter
            categories={categories}
            counts={categoryCounts}
            picked={focus?.type === 'category' ? focus.keys : []}
            onChange={keys => {
              onFocusCategories(keys);
              setLimit(PAGE);
            }}
          />
          {(showBanks || bank) && (
            <select
              className="select"
              aria-label="Bank"
              value={bank ?? ''}
              onChange={event => {
                setBank(event.target.value || null);
                setLimit(PAGE);
              }}
            >
              <option value="">All banks</option>
              {/* The bank picked stays listed in a period without its payments. */}
              {[...new Set([...bankCounts.keys(), ...(bank ? [bank] : [])])].sort().map(name => (
                <option key={name} value={name}>
                  {name} ({bankCounts.get(name) ?? 0})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {(hidden.moneyIn > 0 || hidden.own > 0 || hidden.category > 0 || hidden.period > 0) && (
        <p className="search-hidden">
          More matches:{' '}
          {[
            hidden.moneyIn > 0 && (
              <button
                key="money-in"
                type="button"
                className="link-button"
                onClick={() => {
                  setMoneyIn(true);
                  savePaymentsEverything(true);
                }}
              >
                {hidden.moneyIn} under 💶 Money in
              </button>
            ),
            hidden.own > 0 && (
              <button
                key="own"
                type="button"
                className="link-button"
                onClick={() => {
                  setOwn(true);
                  savePaymentsOwn(true);
                }}
              >
                {hidden.own} under 🔁 My accounts
              </button>
            ),
            hidden.category > 0 && (
              <button key="category" type="button" className="link-button" onClick={() => onFocusCategories([])}>
                {hidden.category} in other categories
              </button>
            ),
            hidden.period > 0 && (
              <button key="period" type="button" className="link-button" onClick={onAllTime}>
                {hidden.period} in other periods
              </button>
            ),
          ]
            .filter(Boolean)
            .flatMap((item, index) => (index === 0 ? [item] : [' · ', item]))}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="empty">
          {toCheck ? 'Nothing left to check here.' : words.length ? 'No payment matches.' : 'No payments here.'}
        </p>
      ) : (
        <table>
          <thead className="visually-hidden">
            <tr>
              <th>Pick</th>
              {(!byDay || withTimes) && <th>{byDay ? 'Time' : 'Day'}</th>}
              <th>Store</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {page.map((row, index) => {
              const category = categories.byKey[row.category];
              return [
                byDay && row.date !== page[index - 1]?.date && (
                  <tr key={`day-${row.date}`} className="day-row">
                    <th colSpan={withTimes ? 4 : 3} scope="rowgroup">
                      {recentDayLabel(row.date, withYears)}
                      {dayParts.get(row.date) && (
                        <span className="day-strip" aria-hidden="true">
                          {[...(dayParts.get(row.date) ?? [])]
                            .sort((first, second) => second[1] - first[1])
                            .map(([key, value]) => (
                              <span key={key} style={{...colourStyle(categories.colours[key]), flexGrow: value}} />
                            ))}
                        </span>
                      )}
                    </th>
                    <td className="payment-amount">
                      {/* A day with one payment already shows its amount on the row. */}
                      {(dayCounts.get(row.date) ?? 0) > 1 && dayTotals.get(row.date)
                        ? money(-(dayTotals.get(row.date) ?? 0), row.currency, true)
                        : ''}
                    </td>
                  </tr>
                ),
                <tr
                  key={row.id}
                  className={`${(row.counts && row.spend !== 0) || isIncoming(row) ? '' : 'is-muted'}${picked.has(row.id) ? ' is-picked' : ''}`}
                  onClick={event => {
                    if (opensCategory(event)) setSheet([row]);
                  }}
                >
                  <td className="payment-pick">
                    <input
                      type="checkbox"
                      aria-label={`Tick ${row.store}, ${dayLabel(row.date)}`}
                      checked={picked.has(row.id)}
                      readOnly
                      onClick={event => pick(row, event.shiftKey)}
                    />
                  </td>
                  {!byDay && (
                    <td className={`payment-day${withYears ? ' with-year' : ''}`}>
                      {dayLabel(row.date, withYears)}
                      {row.time && <span className="payment-time"> {row.time}</span>}
                    </td>
                  )}
                  {byDay && withTimes && <td className="payment-day">{row.time ?? ''}</td>}
                  <td className="payment-store">
                    {showBanks && <BankBadge bank={row.bank} />}
                    <button
                      type="button"
                      className="payment-store-name"
                      title={`${row.description}\nRename ${row.store} or change its category`}
                      onClick={() => onOpenStore({key: row.storeKey, name: row.store})}
                    >
                      {row.store}
                    </button>
                    <WebSearch name={row.store} />
                    {row.pending && <span className="tag">pending</span>}
                    {isUnsure(row) && <span className="tag is-check">to check</span>}
                    <RefundTags row={row} paidBack={paidBack} />
                    <PaymentLabels row={row} onLabels={onLabels} onFocusLabel={onFocusLabel} />
                  </td>
                  <td className="payment-category">
                    <button
                      type="button"
                      className={`category-button${row.basis === 'picked' ? '' : ' is-auto'}${
                        isUnsure(row) ? ' is-unsure' : ''
                      }`}
                      aria-label={`Category of this payment at ${row.store}: ${category?.label}${
                        row.basis === 'picked' ? '' : isUnsure(row) ? ' (a guess, to check)' : ' (automatic)'
                      }. Change it`}
                      style={colourStyle(categories.colours[row.category])}
                      onClick={() => setSheet([row])}
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
                  </td>
                  <td className={`payment-amount${row.amount > 0 ? ' is-in' : ''}`}>
                    {money(row.amount, row.currency, true)}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      )}
      {hasMore && <div ref={moreRef} className="payments-more" aria-hidden="true" />}
      {selection.length > 0 && (
        <div className="selection-bar" role="region" aria-label="Ticked payments">
          <strong>{selection.length} ticked</strong>
          <span className="muted">
            {money(
              selection.reduce((sum, row) => sum + row.spend, 0),
              currency,
              true,
            )}
          </span>
          <button type="button" className="button" onClick={() => setSheet(selection)}>
            Set category
          </button>
          <button
            type="button"
            className="button is-quiet"
            title={allIgnored ? 'Back to their usual category' : 'Leave them out of every total'}
            onClick={() => onCategorize(selection, allIgnored ? null : 'ignored', 'payment')}
          >
            {allIgnored ? 'Count again' : 'Ignore'}
          </button>
          <form
            className="selection-label"
            onSubmit={event => {
              event.preventDefault();
              labelPicked();
            }}
          >
            <input
              className="text-input"
              list="tillroll-labels"
              aria-label="Label for the ticked payments"
              placeholder="Label them"
              value={pickedLabel}
              maxLength={40}
              onChange={event => setPickedLabel(event.target.value)}
            />
            <button type="submit" className="button" disabled={!tidyLabel(pickedLabel)}>
              Add label
            </button>
          </form>
          <button type="button" className="link-button" onClick={() => setPicked(new Set())}>
            Untick all
          </button>
        </div>
      )}
      <LabelOptions names={labelNames} />
      {sheet && (
        <CategorySheet
          title={sheet.length === 1 ? sheet[0].store : `${sheet.length} payments`}
          detail={
            sheet.length === 1
              ? `${dayLabel(sheet[0].date, true)} · ${money(sheet[0].amount, sheet[0].currency, true)}`
              : `${sheetStores.length === 1 ? sheetStores[0] : `${sheetStores.length} stores`} · ${money(
                  sheet.reduce((sum, row) => sum + row.spend, 0),
                  currency,
                  true,
                )}`
          }
          scopes={scopes}
          categories={categories}
          current={sheetCategories.size === 1 ? [...sheetCategories][0] : null}
          guess={sheet.every(row => row.basis !== 'picked')}
          frequent={topCategories(rows, 4)}
          payback={
            sheet.length === 1 &&
            sheet[0].amount > 0 && (
              <PaybackPicker
                row={rows.find(row => row.id === sheet[0].id) ?? sheet[0]}
                rows={allRows}
                onLink={paymentId => {
                  onPayback(sheet[0], paymentId);
                  setSheet(null);
                }}
              />
            )
          }
          labels={
            sheet.length === 1 && (
              <PaymentLabels
                // The payment as it is now: labels added in the sheet show at once.
                row={rows.find(row => row.id === sheet[0].id) ?? sheet[0]}
                onLabels={onLabels}
                onFocusLabel={label => {
                  setSheet(null);
                  onFocusLabel(label);
                }}
              />
            )
          }
          onPick={(category, scope) => {
            onCategorize(sheet, category, scope);
            if (sheet.length > 1) setPicked(new Set());
          }}
          onCreate={(label, icon, scope) => {
            onCreateCategory(sheet, label, icon, scope);
            if (sheet.length > 1) setPicked(new Set());
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
