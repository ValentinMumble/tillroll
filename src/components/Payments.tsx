import {useContext, useEffect, useRef, useState} from 'react';
import {type Categories, colourStyle} from '../categories';
import {money} from '../format';
import {tidyLabel, withLabel} from '../labels';
import {dayLabel, recentDayLabel} from '../periods';
import {
  bankOf,
  givenBack,
  givenTitle,
  isListed,
  isIncoming,
  isUnsure,
  type Row,
  searchText,
  topCategories,
} from '../rows';
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
import {CategorySheet, MOST_USED, type Scope} from './CategorySheet';
import {ListSwitches} from './ListSwitches';
import {LabelOptions, PaymentLabels} from './PaymentLabels';
import {PaidBackBy, PaybackPicker} from './PaybackPicker';
import {RefundTags} from './RefundTags';
import {WebSearch} from './WebSearch';
import {paymentCount, plain} from '../text';
import {TripLabels} from '../tripLabels';
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
  /** The payments that put money in a savings account or take it back, by id (see savingsAccounts). */
  savingsMoves: Set<string>;
}

const PAGE = 60;

/** The sort buttons, with the way each one starts: newest, biggest, A to Z. */
const SORTS: {key: PaymentSort['key']; label: string; descending: boolean}[] = [
  {key: 'date', label: 'Date', descending: true},
  {key: 'amount', label: 'Amount', descending: true},
  {key: 'store', label: 'Store', descending: false},
];

/** How the list in context reads, whatever the sort: by day, newest first. */
const NEWEST: PaymentSort = {key: 'date', descending: true};

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
  savingsMoves,
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
  const tripLabels = useContext(TripLabels);
  // Categories picked on top of a label or a store (a trip's eating out): kept for that filter only, a new one drops
  // them. With no label or store, a category picked is the list's filter itself (focus).
  const [narrowed, setNarrowed] = useState<{focus: Focus; keys: CategoryKey[]} | null>(null);
  const narrows = focus?.type === 'label' || focus?.type === 'store';
  const pickedCategories =
    focus?.type === 'category' ? focus.keys : narrows && narrowed?.focus === focus ? narrowed.keys : [];
  // "See in context": every payment around a day of the filtered list, the filter's matches marked. It keeps what to
  // go back to (the filter it came from, which a new filter closes it for, and how far that list was drawn), and how
  // many newer payments show above the day.
  const [context, setContext] = useState<{
    date: string;
    matches: Set<string>;
    focus: Focus | null;
    back: number;
    newer: number;
  } | null>(null);
  const around = context && context.focus === focus ? context : null;
  // The day heading to bring into view once the list is drawn, on opening or closing the context.
  const jumpTo = useRef<string | null>(null);
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
  // The label or store picked, alone: what the category filter counts in.
  const inLabelOrStore = (row: Row) => {
    if (focus?.type === 'label' && !row.labels.some(label => label.toLowerCase() === focus.key.toLowerCase())) {
      return false;
    }
    return focus?.type !== 'store' || row.storeKey === focus.key;
  };
  const inFocus = (row: Row) => {
    if (bank && bankOf(row) !== bank) return false;
    if (toCheck && !isUnsure(row)) return false;
    if (pickedCategories.length && !pickedCategories.includes(row.category)) return false;
    if (focus?.type === 'label' && !row.labels.some(label => label.toLowerCase() === focus.key.toLowerCase())) {
      return false;
    }
    return focus?.type !== 'store' || row.storeKey === focus.key;
  };
  // A category picked in the filter shows its payments, even the ones that are not spending.
  const switchedOn = (row: Row) => isListed(row, {moneyIn, own}) || pickedCategories.length > 0 || toCheck;
  // In context, every period and every category, newest first; the switches still apply, but never to the matches.
  const visible = around
    ? allRows
        .filter(row => isListed(row, {moneyIn, own}) || around.matches.has(row.id))
        .sort((first, second) => compare(first, second, NEWEST))
    : rows
        .filter(row => inFocus(row) && switchedOn(row) && matches(row))
        .sort((first, second) => compare(first, second, sort));
  const filtered = !around && (words.length > 0 || focus !== null || bank !== null);
  // A search also counts the matches the switches, the category filter and the period leave out.
  const found = words.length && !around ? rows.filter(matches) : [];
  const hiddenBySwitch = found.filter(row => inFocus(row) && !switchedOn(row));
  const hidden = {
    moneyIn: hiddenBySwitch.filter(row => row.category !== 'own').length,
    own: hiddenBySwitch.filter(row => row.category === 'own').length,
    category: pickedCategories.length
      ? found.filter(
          row => !pickedCategories.includes(row.category) && inLabelOrStore(row) && isListed(row, {moneyIn, own}),
        ).length
      : 0,
    period: 0,
  };
  if (words.length && !around) {
    const here = new Set(rows.map(row => row.id));
    hidden.period = allRows.filter(
      row => !here.has(row.id) && inFocus(row) && isListed(row, {moneyIn, own}) && matches(row),
    ).length;
  }
  // By date, the list reads like a bank statement: a heading per day, with what went out that day.
  const byDay = around !== null || sort.key === 'date';
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
  // What the listed moves put in savings, less what they took back (the moves show with "My accounts" on).
  const toSavings = visible.filter(row => savingsMoves.has(row.id)).reduce((sum, row) => sum - row.amount, 0);
  // The money in that gave each payment back, refunds and paybacks, for their tags and the payment's sheet.
  const given = givenBack(allRows);
  // Moves between one's own accounts are in no total: their switch counts the period's.
  const moves = rows.filter(row => row.category === 'own').length;
  // In context, the list starts a few newer payments above the day, so the day sits near the top.
  const anchor = around
    ? Math.max(
        0,
        visible.findIndex(row => row.date <= around.date),
      )
    : 0;
  const start = Math.max(0, anchor - (around?.newer ?? 0));
  const page = visible.slice(start, anchor + limit);
  // The next payments come in as the end of the list nears (a screen ahead), so a long period stays quick to draw.
  const moreRef = useRef<HTMLDivElement>(null);
  const hasMore = visible.length > anchor + limit;
  useEffect(() => {
    if (!jumpTo.current) return;
    document.getElementById(`payments-day-${jumpTo.current}`)?.scrollIntoView({block: 'center'});
    jumpTo.current = null;
  }, [context]);
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
  // A time column only when some payments listed have a time (statements give one, the bank sync does not): over the
  // whole list, not only the rows drawn, so it never appears while the list scrolls.
  const withTimes = visible.some(row => row.time);
  // Dates carry their year when the list covers more than one (all time, a label, the context of a day): the period's
  // years, not only the ones a search or a filter leaves, so one match over all time still says its year. A week, a
  // month or a year has its year in the period picker already.
  const withYears = new Set([...rows, ...visible].map(row => row.date.slice(0, 4))).size > 1;
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
  // The filters' counts: each category's within the bank and the label or store picked, each bank's in the whole
  // period.
  const categoryCounts = new Map<CategoryKey, number>();
  const bankCounts = new Map<string, number>();
  for (const row of rows) {
    bankCounts.set(bankOf(row), (bankCounts.get(bankOf(row)) ?? 0) + (counted(row) ? 1 : 0));
    if ((bank && bankOf(row) !== bank) || !inLabelOrStore(row)) continue;
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

  /** Shows every payment around this day, with the filter's matches marked; going back brings the filter back. */
  function openContext(date: string) {
    jumpTo.current = date;
    setContext({date, matches: new Set(visible.map(row => row.id)), focus, back: limit, newer: 8});
    setLimit(PAGE);
  }

  function closeContext() {
    if (!around) return;
    jumpTo.current = around.date;
    setLimit(around.back);
    setContext(null);
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

  // A label's filter chip says # before it, a trip's does not (as on the payments' chips).
  const focusLabel =
    focus?.type === 'label'
      ? tripLabels.has(focus.key.toLowerCase())
        ? focus.key
        : `# ${focus.key}`
      : focus?.type === 'store'
        ? focus.name
        : null;

  return (
    <section className="card payments">
      <header className="card-head">
        <h2>Payments</h2>
        {/* In context the list covers every period: no totals, no filter, no sort. */}
        {!around && <span className="view-total">{money(spent, currency)}</span>}
        {!around && (
          <span className="hint">
            {paymentCount(paid)}
            {moneyIn && movedOut > 0 && ` · ${money(movedOut, currency)} moved out`}
            {Math.abs(toSavings) >= 0.5 &&
              ` · ${money(Math.abs(toSavings), currency)} ${toSavings > 0 ? 'to savings' : 'taken from savings'}`}
            {moneyIn && cameIn > 0 && ` · ${money(cameIn, currency)} in`}
            {focus?.type === 'label' && ' · all time'}
          </span>
        )}
        {focusLabel && !around && (
          <button type="button" className="chip" aria-label={`Remove the filter ${focusLabel}`} onClick={onClearFocus}>
            {focusLabel} <span aria-hidden="true">✕</span>
          </button>
        )}
        {focus?.type === 'store' && !around && (
          <button type="button" className="link-button" onClick={() => onEditStore(focus.key)}>
            Rename or merge
          </button>
        )}
        {!around && (
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
        )}
        <ListSwitches moneyIn={moneyIn} own={own} moves={moves} onMoneyIn={setMoneyIn} onOwn={setOwn} />
      </header>
      {around && (
        <div className="payments-context">
          <span>
            Every payment around <strong>{dayLabel(around.date, true)}</strong>, the ones{' '}
            {words.length ? 'your search' : 'your filter'} found marked
          </span>
          <button type="button" className="button is-quiet" onClick={closeContext}>
            ← Back to the {words.length ? 'search' : 'filtered list'}
          </button>
        </div>
      )}
      {!around && (
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
              picked={pickedCategories}
              onChange={keys => {
                // On a label or a store, the categories narrow it; otherwise they are the filter.
                if (narrows && focus) setNarrowed({focus, keys});
                else onFocusCategories(keys);
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
      )}
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
              <button
                key="category"
                type="button"
                className="link-button"
                onClick={() => (narrows ? setNarrowed(null) : onFocusCategories([]))}
              >
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
        <>
          {around && start > 0 && (
            <button
              type="button"
              className="link-button payments-newer"
              onClick={() => setContext({...around, newer: around.newer + PAGE})}
            >
              Show newer payments
            </button>
          )}
          <table>
            {/* Fixed column widths, so the payments coming in as the list scrolls never move the columns. */}
            <colgroup>
              <col className="col-pick" />
              {(!byDay || withTimes) && <col className={`col-day${!byDay && withYears ? ' with-year' : ''}`} />}
              <col />
              <col className="col-category" />
              <col className="col-amount" />
            </colgroup>
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
                    <tr key={`day-${row.date}`} id={`payments-day-${row.date}`} className="day-row">
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
                        {filtered && (
                          <button
                            type="button"
                            className="link-button day-context"
                            aria-label={`See every payment around ${dayLabel(row.date, true)}`}
                            onClick={() => openContext(row.date)}
                          >
                            See in context
                          </button>
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
                    className={`${(row.counts && row.spend !== 0) || isIncoming(row) ? '' : 'is-muted'}${picked.has(row.id) ? ' is-picked' : ''}${around?.matches.has(row.id) ? ' is-match' : ''}`}
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
                        {/* Sorted by amount or store, there are no day headings: the date opens the context. */}
                        {filtered ? (
                          <button
                            type="button"
                            className="payment-day-link"
                            title="See every payment around this day"
                            onClick={() => openContext(row.date)}
                          >
                            {dayLabel(row.date, withYears)}
                          </button>
                        ) : (
                          dayLabel(row.date, withYears)
                        )}
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
                      {row.viaPayPal && (
                        <span
                          className="tag"
                          title="It paid a PayPal purchase, which counts at its shop: a move between your accounts"
                        >
                          via PayPal
                        </span>
                      )}
                      {isUnsure(row) && <span className="tag is-check">to check</span>}
                      <RefundTags row={row} givenBack={given} onOpen={() => setSheet([row])} />
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
        </>
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
          frequent={topCategories(rows, MOST_USED + 1)}
          payback={
            sheet.length !== 1 ? null : sheet[0].amount > 0 ? (
              <PaybackPicker
                row={rows.find(row => row.id === sheet[0].id) ?? sheet[0]}
                rows={allRows}
                onLink={paymentId => {
                  onPayback(sheet[0], paymentId);
                  setSheet(null);
                }}
              />
            ) : (
              given.has(sheet[0].id) && (
                <PaidBackBy
                  credits={given.get(sheet[0].id) ?? []}
                  onUnlink={credit => {
                    onPayback(credit, null);
                    setSheet(null);
                  }}
                />
              )
            )
          }
          paybackTitle={sheet.length === 1 && sheet[0].amount < 0 ? givenTitle(given.get(sheet[0].id)) : undefined}
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
