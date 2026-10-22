import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  disconnectBank,
  fetchOwnerData,
  importStatement,
  RequestError,
  saveBudget,
  saveCategories,
  saveDistinct,
  saveSavingsValues,
  saveLabels,
  savePaymentCategories,
  saveMerge,
  saveRule,
  signIn,
  signOut,
  startBankConnection,
  syncBank,
} from './api';
import {type Category, categoriesFrom, editsFrom, newCategoryKey} from './categories';
import {CategoryBreakdown, type Focus, StoreBreakdown} from './components/Breakdown';
import {CategoryDialog} from './components/CategoryDialog';
import {Calendar} from './components/Calendar';
import {BankDialog} from './components/BankDialog';
import {CategoryEditor} from './components/CategoryEditor';
import {DuplicatesDeck} from './components/DuplicatesDeck';
import {FunStats} from './components/FunStats';
import {ImportButton} from './components/ImportButton';
import {Insights} from './components/Insights';
import {Landing} from './components/Landing';
import {LabelList} from './components/LabelList';
import {LatestPayments} from './components/LatestPayments';
import {Menu} from './components/Menu';
import {Payments} from './components/Payments';
import {Sidebar} from './components/Sidebar';
import {Savings} from './components/Savings';
import {RegularPayments} from './components/RegularPayments';
import {BudgetCard} from './components/Budgets';
import {Logo} from './components/Logo';
import {MoneyFlow} from './components/MoneyFlow';
import {FixedSplit} from './components/FixedSplit';
import {OverviewSkeleton} from './components/Skeleton';
import {Sorter} from './components/Sorter';
import {StoreDialog} from './components/StoreDialog';
import {StoreEditor} from './components/StoreEditor';
import {MergesDialog} from './components/MergesDialog';
import {PeriodChart} from './components/PeriodChart';
import {Summary} from './components/Summary';
import {TabBar} from './components/TabBar';
import {Toolbar} from './components/Toolbar';
import {timeAgo} from './format';
import {forgetOwnerKey, isOwnerBrowser, keepOwnerKey, pendingOwnerKey} from './owner';
import {type Grain, periodEnd, periodOf, shiftPeriod, today} from './periods';
import {buildReport, isUnsure, type Row, rowsBetween, type StoreToSort, storesToSort, toRows} from './report';
import {sampleTransactions} from './sample';
import {readStatement} from './statement';
import {findDuplicates, type Pair} from './duplicates';
import {withLabel, withoutLabel} from './labels';
import {storeKey as keyOfStore} from './stores';
import {
  loadGrain,
  loadLocalData,
  loadLocalSorting,
  saveGrain,
  saveLocalData,
  saveLocalSorting,
  savePaymentSort,
} from './storage';
import {MENU_ONLY, type Tab, TABS} from './tabs';
import type {
  Balance,
  Budgets,
  CategoryEdit,
  CategoryKey,
  Connection,
  Labels,
  Merges,
  PaymentCategories,
  Rules,
  SavingsRecord,
  SavingsValues,
  Transaction,
} from './types';

interface Data {
  source: 'sample' | 'statement' | 'owner';
  transactions: Transaction[];
  rules: Rules;
  categories: CategoryEdit[];
  merges: Merges;
  labels: Labels;
  paymentCategories: PaymentCategories;
  /** Pairs of stores marked "not the same" in the duplicates deck. */
  distinct: string[];
  /** Savings accounts' values typed by hand. */
  savingsValues: SavingsValues;
  budgets: Budgets;
  /** The bank accounts' balances: the owner's bank sync only. */
  balances?: Balance[];
  connections: Connection[];
}

/** The open dialog, with the store it was opened for. */
type Dialog =
  | {type: 'categories'; store: {key: string; name: string} | null}
  | {type: 'stores'; store: string | null}
  /** Every merged and renamed store. */
  | {type: 'merges'}
  /** One store, opened with a double-click. */
  | {type: 'store'; store: {key: string; name: string}}
  /** One category's month by month, opened from its trend. */
  | {type: 'category'; category: CategoryKey}
  /** The bank picker, to connect another bank. */
  | {type: 'banks'}
  /** The duplicates deck keeps the pairs it opened with. */
  | {type: 'duplicates'; pairs: Pair[]}
  /** The sorting deck keeps the list of stores it opened with. */
  | {type: 'sort'; queues: {unsure: StoreToSort[]; automatic: StoreToSort[]}};

interface Notice {
  tone: 'info' | 'error';
  text: string;
}

/** A sync older than this runs again when the owner opens the page. */
const SYNC_AFTER = 6 * 3_600_000;

function localData(): Data | null {
  const saved = loadLocalData();
  if (!saved) return null;
  const transactions = saved.source === 'sample' ? sampleTransactions() : saved.transactions;
  return {source: saved.source, transactions, ...loadLocalSorting(), connections: []};
}

/**
 * The owner's statement rows of a bank stop where that bank's synced history starts, per currency, so nothing counts
 * twice. The sync dates a row on the day the bank books it, so a statement's card payment compares by its debit day.
 * Rows with no bank (older ones) are Revolut's.
 */
/**
 * Merges stores into one by its name (`into`). The store of that name may itself be merged back into one of them
 * (Dr Martens Tour into Dr. Martens, then Dr. Martens into Dr Martens Tour): that would loop, so it becomes the store
 * they end in again. Returns the merges and the store keys that are no longer merged.
 */
function mergedInto(merges: Merges, storeKeys: string[], into: string) {
  const next = {...merges};
  const targetKey = keyOfStore(into);
  const freed: string[] = [];
  let key = targetKey;
  for (let step = 0; step < 10 && next[key]; step += 1) {
    const after = keyOfStore(next[key]);
    if (after === key) break;
    if (storeKeys.includes(after)) {
      delete next[targetKey];
      freed.push(targetKey);
      break;
    }
    key = after;
  }
  for (const storeKey of storeKeys) next[storeKey] = into;
  return {merges: next, freed};
}

function withoutOverlap(transactions: Transaction[]) {
  const keyOf = (item: Transaction) => `${item.bank ?? 'Revolut'}|${item.currency}`;
  const bankStart = new Map<string, string>();
  for (const item of transactions) {
    if (item.source !== 'bank') continue;
    const start = bankStart.get(keyOf(item));
    if (!start || item.date < start) bankStart.set(keyOf(item), item.date);
  }
  return transactions.filter(item => {
    const start = bankStart.get(keyOf(item));
    return item.source !== 'statement' || !start || (item.bookedOn ?? item.date) < start;
  });
}

/** A deferred card's monthly debit, as an account's statement gives it ("Carte ...7497 (débit différé)"). */
const isCardTotal = (item: Transaction) => item.source === 'statement' && / \(débit différé\)$/.test(item.description);

/**
 * A deferred card's monthly debit leaves once the card's own statement lists the payments it paid: the card lines
 * debited in that month add up to it (to the cent). Two cards debited the same month leave together when both cards'
 * lines are in; with one card's lines only, the other card's debit stays.
 */
function withoutCoveredTotals(transactions: Transaction[]) {
  const debitMonth = (item: Transaction) => {
    if (item.bookedOn) return item.bookedOn.slice(0, 7);
    // A total imported before the debit day was kept sits on the last day of the month before it.
    const next = new Date(`${item.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 7);
  };
  const cardLines = new Map<string, number>();
  for (const item of transactions) {
    if (item.source !== 'statement' || !item.bookedOn || isCardTotal(item)) continue;
    const key = `${item.bank}|${item.currency}|${debitMonth(item)}`;
    cardLines.set(key, (cardLines.get(key) ?? 0) + item.amount);
  }
  const totals = new Map<string, Transaction[]>();
  for (const item of transactions) {
    if (!isCardTotal(item)) continue;
    const key = `${item.bank}|${item.currency}|${debitMonth(item)}`;
    totals.set(key, [...(totals.get(key) ?? []), item]);
  }
  const covered = new Set<string>();
  for (const [key, list] of totals) {
    const lines = cardLines.get(key);
    if (lines === undefined) continue;
    const all = list.reduce((sum, item) => sum + item.amount, 0);
    const paid = Math.abs(lines - all) < 0.01 ? list : list.filter(item => Math.abs(lines - item.amount) < 0.01);
    for (const item of paid) covered.add(item.id);
  }
  return transactions.filter(item => !covered.has(item.id));
}

/** Where the page is: its view, and the filter of the payment list. One step of the browser's history each. */
interface Place {
  tab: Tab;
  focus: Focus | null;
}

/**
 * The place this history step holds (a reload keeps it), else the view in the address (#payments), else the
 * overview.
 */
function placeFromHistory(): Place {
  const saved = window.history.state as Place | null;
  if (saved?.tab) return saved;
  const name = window.location.hash.slice(1);
  return {tab: TABS.some(item => item.key === name) ? (name as Tab) : 'overview', focus: null};
}

/** The message /api/callback leaves in the address when the bank sends the owner back. */
function noticeFromAddress(): Notice | null {
  const query = new URLSearchParams(window.location.search);
  const error = query.get('bank-error');
  const connected = query.get('bank') === 'connected';
  if (!error && !connected) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  if (error) return {tone: 'error', text: error};
  return {
    tone: 'info',
    text: `${query.get('name') ?? 'The bank'} is connected: ${query.get('count') ?? 'its'} transactions synced.`,
  };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

export default function App() {
  const [isOwner, setIsOwner] = useState(isOwnerBrowser);
  const [data, setData] = useState<Data | null>(() => (isOwnerBrowser() ? null : localData()));
  const [loading, setLoading] = useState(isOwner);
  const [notice, setNotice] = useState<Notice | null>(noticeFromAddress);
  const [busy, setBusy] = useState<string | null>(null);
  const [grain, setGrain] = useState<Grain>(loadGrain);
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(() => placeFromHistory().focus);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // One view at a time: picked in the sidebar on wide screens, in the tab bar on a phone.
  const [tab, setTab] = useState<Tab>(() => placeFromHistory().tab);
  // Bumped to start the payment list over: a new key gives it a fresh search and no ticks.
  const [paymentsRun, setPaymentsRun] = useState(0);

  /** A view picked in the sidebar or the tab bar. Picking Payments again clears its filter and search, newest first. */
  function openTab(next: Tab) {
    if (next === 'payments' && tab === 'payments') {
      setFocus(null);
      savePaymentSort({key: 'date', descending: true});
      setPaymentsRun(run => run + 1);
      window.scrollTo({top: 0});
    }
    setTab(next);
  }

  // Each view and filter is a step of the browser's history, in the address too (#payments): Back and Forward move
  // between them. The step Back lands on already holds the place, so it adds none.
  useEffect(() => {
    const place: Place = {tab, focus};
    if (JSON.stringify(window.history.state) === JSON.stringify(place)) return;
    const address = `${window.location.pathname}${window.location.search}${tab === 'overview' ? '' : `#${tab}`}`;
    if (window.history.state === null) window.history.replaceState(place, '', address);
    else window.history.pushState(place, '', address);
  }, [tab, focus]);

  useEffect(() => {
    function onPopState() {
      const place = placeFromHistory();
      setTab(place.tab);
      setFocus(place.focus);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** Back to the public version, for instance after the owner key changed. */
  const leaveOwnerMode = useCallback((message: string) => {
    forgetOwnerKey();
    void signOut().catch(() => undefined);
    setIsOwner(false);
    setData(localData());
    setLoading(false);
    setNotice({tone: 'error', text: message});
  }, []);

  const loadOwner = useCallback(async () => {
    try {
      const owner = await fetchOwnerData();
      // Fields an older server may not send yet start empty.
      setData({
        source: 'owner',
        ...owner,
        rules: owner.rules ?? {},
        categories: owner.categories ?? [],
        merges: owner.merges ?? {},
        labels: owner.labels ?? {},
        paymentCategories: owner.paymentCategories ?? {},
        distinct: owner.distinct ?? [],
        savingsValues: owner.savingsValues ?? {},
        budgets: owner.budgets ?? {},
        balances: owner.balances ?? [],
        connections: owner.connections ?? [],
      });
      return owner;
    } catch (error) {
      if (error instanceof RequestError && error.status === 403)
        leaveOwnerMode('This owner key is not valid: you see the public version.');
      else setNotice({tone: 'error', text: messageOf(error)});
      return null;
    } finally {
      setLoading(false);
    }
  }, [leaveOwnerMode]);

  const sync = useCallback(async () => {
    setBusy('sync');
    try {
      const result = await syncBank();
      await loadOwner();
      return result;
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
      return null;
    } finally {
      setBusy(null);
    }
  }, [loadOwner]);

  // Once, when the page opens (StrictMode runs effects twice in development: one sync is enough).
  const started = useRef(false);
  useEffect(() => {
    if (!isOwner || started.current) return;
    started.current = true;
    const start = async () => {
      // A key from a #owner= address or the footer becomes the year-long cookie, then leaves the page's storage.
      const key = pendingOwnerKey();
      if (key) {
        try {
          await signIn(key);
          forgetOwnerKey();
        } catch (error) {
          if (error instanceof RequestError && error.status === 403) {
            leaveOwnerMode('This owner key is not valid: you see the public version.');
            return;
          }
        }
      }
      const owner = await loadOwner();
      // A sync when a bank with access was last synced more than 6 hours ago.
      const stale = (owner?.connections ?? []).some(
        item => !item.expired && (!item.syncedAt || Date.now() - Date.parse(item.syncedAt) > SYNC_AFTER),
      );
      if (stale) await sync();
    };
    void start();
  }, [isOwner, leaveOwnerMode, loadOwner, sync]);

  const categories = useMemo(() => categoriesFrom(data?.categories ?? []), [data?.categories]);
  const rows = useMemo(() => {
    if (!data) return [];
    const transactions = withoutCoveredTotals(
      data.source === 'owner' ? withoutOverlap(data.transactions) : data.transactions,
    );
    return toRows(transactions, {
      rules: data.rules,
      categories,
      merges: data.merges,
      labels: data.labels,
      paymentCategories: data.paymentCategories,
      // A bank account is named after its holder: transfers naming them are between their own accounts.
      me: data.connections.flatMap(connection => connection.accounts.map(account => account.name)),
    });
  }, [data, categories]);

  // The account holders each bank names, as it writes them: a livret's moves name them at its own bank.
  const holders = useMemo(() => {
    const byBank: Record<string, string[]> = {};
    for (const connection of data?.connections ?? []) {
      byBank[connection.bank] = [
        ...(byBank[connection.bank] ?? []),
        ...connection.accounts.map(account => account.name),
      ];
    }
    return byBank;
  }, [data?.connections]);

  // Currencies by number of payments: the main account first.
  const currencies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
    return [...counts].sort((first, second) => second[1] - first[1]).map(([currency]) => currency);
  }, [rows]);
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? 'EUR');

  /** Another currency: its own periods and payments, from its latest period, no filter. */
  function changeCurrency(next: string) {
    setChosenCurrency(next);
    setChosenPeriod(null);
    setFocus(null);
  }
  const currencyRows = useMemo(() => rows.filter(row => row.currency === currency), [rows, currency]);
  // With payments from several banks, each payment shows its bank's letter.
  const showBanks = useMemo(() => new Set(rows.map(row => row.bank ?? 'Revolut')).size > 1, [rows]);

  const lastDay = currencyRows[0]?.date ?? today();
  const firstDay = currencyRows.at(-1)?.date ?? lastDay;
  const latestPeriod = periodOf(lastDay, grain);
  const firstPeriod = periodOf(firstDay, grain);
  const period =
    chosenPeriod && chosenPeriod >= firstPeriod && chosenPeriod <= latestPeriod ? chosenPeriod : latestPeriod;
  // Every label in use, most used first, offered while typing one.
  const labelNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of Object.values(data?.labels ?? {})) {
      for (const label of list) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].sort((first, second) => second[1] - first[1]).map(([label]) => label);
  }, [data?.labels]);

  // Look-alike stores, for the duplicates deck (pairs marked "not the same" stay out).
  const duplicates = useMemo(() => findDuplicates(rows, new Set(data?.distinct ?? [])), [rows, data?.distinct]);

  // Stores with an unsure category, in every currency: categories are per store.
  const toSort = useMemo(() => storesToSort(rows), [rows]);
  const report = useMemo(
    () => buildReport(currencyRows, period, grain, today(), categories),
    [currencyRows, period, grain, categories],
  );
  const periodRows = useMemo(() => rowsBetween(currencyRows, report.from, report.to), [currencyRows, report]);
  const toCheck = useMemo(() => periodRows.filter(isUnsure).length, [periodRows]);

  function changeGrain(next: Grain) {
    if (next === grain) return;
    const end = periodEnd(period, grain);
    setChosenPeriod(periodOf(end < lastDay ? end : lastDay, next));
    setGrain(next);
    saveGrain(next);
  }

  function changePeriod(next: string) {
    setChosenPeriod(next);
    setFocus(null);
  }

  /** Narrows the payment list to a category or a store, and opens it. */
  function focusOn(next: Focus | null) {
    setFocus(next);
    if (next) {
      setTab('payments');
      window.scrollTo({top: 0});
    }
  }

  /** A chart column: in the all-time view the columns are years, so a click opens that year. */
  function selectChartPeriod(next: string) {
    if (grain === 'all') {
      setGrain('year');
      saveGrain('year');
    }
    changePeriod(next);
  }

  /** Shows a change at once, then saves it: in the store for the owner, in the browser for a visitor. */
  async function change(update: Partial<Data>, saveOnServer: () => Promise<unknown>) {
    if (!data) return;
    setData(previous => previous && {...previous, ...update});
    if (data.source !== 'owner') {
      saveLocalSorting(update);
      return;
    }
    try {
      await saveOnServer();
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
    }
  }

  async function changeCategory(storeKey: string, category: CategoryKey | null) {
    if (!data) return;
    const rules = {...data.rules};
    if (category) rules[storeKey] = category;
    else delete rules[storeKey];
    await change({rules}, () => saveRule(storeKey, category));
  }

  async function saveCategoryList(list: Category[], added: CategoryKey | null) {
    const edits = editsFrom(list);
    await change({categories: edits}, () => saveCategories(edits));
    // A category added from a payment's list is picked for that store.
    if (added && dialog?.type === 'categories' && dialog.store) await changeCategory(dialog.store.key, added);
  }

  /**
   * Merges stores into one (by its name). The merged store keeps its category, or takes the first one picked by hand
   * among the stores merged into it, so no choice is lost.
   */
  async function mergeStores(storeKeys: string[], into: string) {
    if (!data) return;
    const {merges, freed} = mergedInto(data.merges, storeKeys, into);
    const targetKey = keyOfStore(into);
    const inherited = data.rules[targetKey] ? undefined : storeKeys.map(key => data.rules[key]).find(Boolean);
    const rules = inherited ? {...data.rules, [targetKey]: inherited} : data.rules;
    if (focus?.type === 'store' && storeKeys.includes(focus.key)) setFocus(null);
    await change({merges, rules}, async () => {
      await Promise.all([...freed.map(key => saveMerge(key, null)), ...storeKeys.map(key => saveMerge(key, into))]);
      if (inherited) await saveRule(targetKey, inherited);
    });
  }

  /** A savings account's values typed by hand, all of them, or an account added by hand (null takes it off). */
  async function setSavings(account: string, record: SavingsRecord | null) {
    if (!data) return;
    const savingsValues = {...data.savingsValues};
    if (record) savingsValues[account] = record;
    else delete savingsValues[account];
    await change({savingsValues}, () => saveSavingsValues(account, record));
  }

  /** A category's monthly budget (null takes it off). */
  async function setBudget(category: CategoryKey, amount: number | null) {
    if (!data) return;
    const budgets = {...data.budgets};
    if (amount === null) delete budgets[category];
    else budgets[category] = amount;
    await change({budgets}, () => saveBudget(category, amount));
  }

  /** A pair of stores marked "not the same" in the duplicates deck. */
  async function markDistinct(pair: string) {
    if (!data) return;
    await change({distinct: [...data.distinct, pair]}, () => saveDistinct([pair]));
  }

  /**
   * The category of some payments: for their stores (every payment there, past and future, and the payments given
   * back to their store), or for these payments only. null goes back to the automatic category.
   */
  async function categorize(targets: Row[], category: CategoryKey | null, scope: string) {
    if (!data) return;
    const paymentCategories = {...data.paymentCategories};
    const paymentChanges: Record<string, CategoryKey | null> = {};
    if (scope === 'payment') {
      for (const row of targets) {
        if (category) paymentCategories[row.id] = category;
        else delete paymentCategories[row.id];
        paymentChanges[row.id] = category;
      }
      await change({paymentCategories}, () => savePaymentCategories(paymentChanges));
      return;
    }
    const rules = {...data.rules};
    const stores = [...new Set(targets.map(row => row.storeKey))];
    for (const key of stores) {
      if (category) rules[key] = category;
      else delete rules[key];
    }
    for (const row of targets) {
      if (!paymentCategories[row.id]) continue;
      delete paymentCategories[row.id];
      paymentChanges[row.id] = null;
    }
    await change({rules, paymentCategories}, async () => {
      await Promise.all(stores.map(key => saveRule(key, category)));
      if (Object.keys(paymentChanges).length) await savePaymentCategories(paymentChanges);
    });
  }

  /** A category made from the category sheet, used at once for the payments it was opened for. */
  async function createCategoryFor(targets: Row[], label: string, icon: string, scope: string) {
    if (!data) return;
    const key = newCategoryKey(label);
    const edits = [...data.categories, {key, label, icon, spending: true}];
    await change({categories: edits}, () => saveCategories(edits));
    await categorize(targets, key, scope);
  }

  /** Renames a label on every payment that has it (every currency); an existing label of that name absorbs it. */
  async function renameLabel(label: string, newLabel: string) {
    if (!data) return;
    const changes: Labels = {};
    for (const [id, list] of Object.entries(data.labels)) {
      if (!list.some(item => item.toLowerCase() === label.toLowerCase())) continue;
      changes[id] = withLabel(withoutLabel(list, label), newLabel);
    }
    if (focus?.type === 'label' && focus.key.toLowerCase() === label.toLowerCase()) {
      setFocus({type: 'label', key: newLabel});
    }
    await setLabels(changes);
  }

  /** Takes a label off every payment that has it. */
  async function deleteLabel(label: string) {
    if (!data) return;
    const changes: Labels = {};
    for (const [id, list] of Object.entries(data.labels)) {
      if (list.some(item => item.toLowerCase() === label.toLowerCase())) changes[id] = withoutLabel(list, label);
    }
    if (focus?.type === 'label' && focus.key.toLowerCase() === label.toLowerCase()) setFocus(null);
    await setLabels(changes);
  }

  /** Each payment's new list of labels (an empty one takes them all off). */
  async function setLabels(changes: Labels) {
    if (!data) return;
    const labels = {...data.labels};
    for (const [id, list] of Object.entries(changes)) {
      if (list.length) labels[id] = list;
      else delete labels[id];
    }
    await change({labels}, () => saveLabels(changes));
  }

  async function separateStore(storeKey: string) {
    if (!data) return;
    const merges = {...data.merges};
    delete merges[storeKey];
    await change({merges}, () => saveMerge(storeKey, null));
  }

  /**
   * A new name is a merge into that name. The category picked for the store moves to the new name, unless that name
   * is another store's that has its own (then it is a merge into that store).
   */
  async function renameStore(storeKey: string, name: string, newName: string) {
    if (!data || !newName.trim() || newName === name) return;
    const newKey = keyOfStore(newName);
    // Another store already has that name: the rename would merge them.
    const taken = newKey !== storeKey && rows.some(row => row.storeKey === newKey);
    if (taken && !window.confirm(`${newName} is already a store. Merge ${name} into it?`)) return;
    const {merges, freed} = mergedInto(data.merges, [storeKey], newName);
    const category = data.rules[storeKey];
    const moveCategory = Boolean(category) && newKey !== storeKey && !data.rules[newKey];
    const rules = moveCategory ? {...data.rules, [newKey]: category} : data.rules;
    if (focus?.type === 'store' && focus.key === storeKey) setFocus({type: 'store', key: newKey, name: newName});
    await change({merges, rules}, async () => {
      await Promise.all([...freed.map(key => saveMerge(key, null)), saveMerge(storeKey, newName)]);
      if (moveCategory) await saveRule(newKey, category);
    });
  }

  /** The store dialog's Save: a new name (a merge into it, see renameStore) and the category, in one change. */
  async function editStore(storeKey: string, name: string, newName: string, category: CategoryKey | null) {
    if (!data) return;
    const renamed = newName !== name;
    const newKey = renamed ? keyOfStore(newName) : storeKey;
    const {merges, freed} = renamed ? mergedInto(data.merges, [storeKey], newName) : {merges: data.merges, freed: []};
    const rules = {...data.rules};
    if (category) rules[newKey] = category;
    else delete rules[newKey];
    if (focus?.type === 'store' && focus.key === storeKey) setFocus({type: 'store', key: newKey, name: newName});
    await change({merges, rules}, async () => {
      await Promise.all(freed.map(key => saveMerge(key, null)));
      if (renamed) await saveMerge(storeKey, newName);
      await saveRule(newKey, category);
    });
  }

  /** A category made from the sorting deck, picked at once for the store. */
  async function addCategoryFor(storeKey: string, label: string, icon: string) {
    if (!data) return;
    const key = newCategoryKey(label);
    const edits = [...data.categories, {key, label, icon, spending: true}];
    await change({categories: edits}, () => saveCategories(edits));
    await changeCategory(storeKey, key);
  }

  async function importFile(file: File) {
    setBusy('import');
    try {
      const transactions = await readStatement(file);
      let kept = true;
      if (isOwner) {
        await importStatement(transactions);
        await loadOwner();
      } else {
        // A new statement adds to the earlier ones: overlapping months keep one copy of each payment.
        const earlier = data?.source === 'statement' ? data.transactions : [];
        const merged = [...new Map([...earlier, ...transactions].map(item => [item.id, item])).values()];
        kept = saveLocalData({source: 'statement', transactions: merged});
        const sorting = data
          ? {
              rules: data.rules,
              categories: data.categories,
              merges: data.merges,
              labels: data.labels,
              paymentCategories: data.paymentCategories,
              distinct: data.distinct,
              savingsValues: data.savingsValues,
              budgets: data.budgets,
            }
          : loadLocalSorting();
        setData({source: 'statement', transactions: merged, ...sorting, connections: []});
      }
      setChosenPeriod(null);
      setFocus(null);
      const warning = kept
        ? ''
        : ' Your browser does not let Tillroll keep them, so they last until you close the page.';
      setNotice({tone: 'info', text: `${transactions.length} transactions read from ${file.name}.${warning}`});
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
    } finally {
      setBusy(null);
    }
  }

  function showSample() {
    saveLocalData({source: 'sample'});
    setData({source: 'sample', transactions: sampleTransactions(), ...loadLocalSorting(), connections: []});
    setChosenPeriod(null);
    setNotice(null);
  }

  function clearLocal() {
    const question =
      data?.source === 'statement'
        ? 'Remove the imported statements, your categories and merged stores from this browser?'
        : 'Leave the sample data?';
    if (!window.confirm(question)) return;
    saveLocalData(null);
    if (data?.source === 'statement') saveLocalSorting(null);
    setData(null);
    setFocus(null);
    setChosenPeriod(null);
  }

  async function connect(bank?: {name: string; country: string}) {
    setBusy('connect');
    try {
      window.location.assign(await startBankConnection(bank));
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
      setBusy(null);
    }
  }

  async function enterOwnerKey() {
    const key = window.prompt('Owner key')?.trim();
    if (!key) return;
    try {
      await signIn(key);
      window.location.reload();
    } catch (error) {
      // Cookies blocked: the key can still wait in the page's storage, the start signs in again with it.
      if (!(error instanceof RequestError) && keepOwnerKey(key)) window.location.reload();
      else setNotice({tone: 'error', text: messageOf(error)});
    }
  }

  async function leaveOwnerView() {
    await signOut().catch(() => undefined);
    forgetOwnerKey();
    window.location.reload();
  }

  async function disconnect(connection: Connection) {
    if (!window.confirm(`End the access to ${connection.bank}? The payments synced so far stay.`)) return;
    try {
      await disconnectBank(connection.id);
      await loadOwner();
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
    }
  }

  const connections = data?.connections ?? [];
  const expired = connections.filter(item => item.expired);
  const live = connections.filter(item => !item.expired);
  const hasData = currencyRows.length > 0;

  // The account part (where the data comes from, sync, import, owner links): in the sidebar on wide screens, in the
  // header and the footer on a phone and on the first screen.
  const status =
    isOwner && connections.length > 0
      ? connections
          .map(item =>
            item.expired
              ? `${item.bank}: access expired`
              : `${item.bank} · ${item.syncedAt ? `synced ${timeAgo(item.syncedAt)}` : 'not synced yet'}`,
          )
          .join(' · ')
      : !isOwner && data
        ? data.source === 'sample'
          ? 'Sample data'
          : 'Your statement'
        : null;
  // Reconnecting and syncing stay in view on a phone; adding a bank goes in the header's ⋯ menu there.
  const syncAction = (
    <>
      {isOwner &&
        expired.map(item => (
          <button
            key={item.id}
            type="button"
            className="button is-primary"
            disabled={busy !== null}
            onClick={() => void connect({name: item.bank, country: item.id.split('|')[1] ?? 'FR'})}
          >
            Reconnect {item.bank}
          </button>
        ))}
      {isOwner && live.length > 0 && (
        <button type="button" className="button" disabled={busy !== null} onClick={() => void sync()}>
          {busy === 'sync' ? 'Syncing…' : 'Sync'}
        </button>
      )}
    </>
  );
  const addBank = isOwner && hasData && (
    <button
      type="button"
      className={`button${connections.length ? ' is-quiet' : ' is-primary'}`}
      disabled={busy !== null}
      onClick={() => setDialog({type: 'banks'})}
    >
      {connections.length ? 'Add a bank' : 'Connect a bank'}
    </button>
  );
  const dataActions = (
    <>
      {hasData && <ImportButton label="Import statement" busy={busy === 'import'} onFile={importFile} />}
      {!isOwner && data && (
        <button type="button" className="button is-quiet" onClick={clearLocal}>
          {data.source === 'sample' ? 'Leave sample' : 'Remove data'}
        </button>
      )}
    </>
  );
  const linkList = [
    !isOwner && (
      <button key="key" type="button" className="link-button" onClick={() => void enterOwnerKey()}>
        Owner key
      </button>
    ),
    ...(isOwner
      ? connections.map(item => (
          <button
            key={`disconnect-${item.id}`}
            type="button"
            className="link-button"
            onClick={() => void disconnect(item)}
          >
            Disconnect {item.bank}
          </button>
        ))
      : []),
    isOwner && (
      <button key="leave" type="button" className="link-button" onClick={() => void leaveOwnerView()}>
        Leave owner view
      </button>
    ),
  ].filter(Boolean);
  const links = linkList.flatMap((link, index) => (index ? [' · ', link] : [link]));
  const footnote = isOwner
    ? 'Owner view: your synced account and statements, kept in the site store.'
    : 'Tillroll reads Revolut statements in your browser. Nothing you import leaves it.';
  const header = (
    <header className="top">
      <a className="brand" href="/">
        <Logo />
        Tillroll
      </a>
      <div className="top-actions">
        {/* The owner's sync status names every bank: too long for a phone's header, it opens the ⋯ menu there. */}
        {!isOwner && status && <span className="status">{status}</span>}
        {syncAction}
        <Menu label="More">
          {isOwner && status && <p className="menu-status">{status}</p>}
          {currencies.length > 1 && (
            // A click on the list must not close the menu before a currency is picked.
            <label className="menu-field" onClick={event => event.stopPropagation()}>
              Currency
              <select className="select" value={currency} onChange={event => changeCurrency(event.target.value)}>
                {currencies.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hasData &&
            TABS.filter(item => MENU_ONLY.includes(item.key)).map(item => (
              <button
                key={item.key}
                type="button"
                className={`button is-quiet${tab === item.key ? ' is-current' : ''}`}
                onClick={() => {
                  openTab(item.key);
                  window.scrollTo({top: 0});
                }}
              >
                {item.label}
              </button>
            ))}
          {addBank}
          {dataActions}
          {linkList}
        </Menu>
      </div>
    </header>
  );
  const noticeBar = notice && (
    <div className={`notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <p>{notice.text}</p>
      <button type="button" aria-label="Close" onClick={() => setNotice(null)}>
        ✕
      </button>
    </div>
  );

  const bankDialog = dialog?.type === 'banks' && (
    <BankDialog
      connected={connections.map(item => item.bank)}
      busy={busy !== null}
      onConnect={bank => void connect(bank)}
      onClose={() => setDialog(null)}
    />
  );

  // While the owner's payments load: the app's own frame (sidebar or tab bar, header) around the overview's outline.
  if (loading) {
    return (
      <div className="shell">
        <Sidebar tab={tab} onTab={openTab} toSort={0} onSort={() => undefined}>
          <span className="skeleton is-line" style={{width: '70%'}} />
        </Sidebar>
        <div className="main">
          {header}
          {noticeBar}
          <OverviewSkeleton />
        </div>
        <TabBar tab={tab} onTab={openTab} />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="page">
        {header}
        {noticeBar}
        <main>
          <Landing
            isOwner={isOwner}
            busy={busy}
            onSample={showSample}
            onImport={importFile}
            onConnect={() => setDialog({type: 'banks'})}
          />
        </main>
        {bankDialog}
        <footer className="foot">
          <p>
            {footnote} {links}
          </p>
        </footer>
      </div>
    );
  }

  const openSorter = () => setDialog({type: 'sort', queues: {unsure: toSort, automatic: storesToSort(rows, true)}});
  const breakdown = {
    report,
    categories,
    currency,
    focus,
    onFocus: focusOn,
  };

  return (
    <div className="shell">
      <Sidebar tab={tab} onTab={openTab} toSort={toSort.length} onSort={openSorter}>
        {status && <p className="status">{status}</p>}
        <div className="side-actions">
          {syncAction}
          {addBank}
          {dataActions}
        </div>
        <p className="side-links">{links}</p>
      </Sidebar>

      <div className="main">
        {header}
        {noticeBar}
        <Toolbar
          grain={grain}
          onGrain={changeGrain}
          period={period}
          onStep={steps => changePeriod(shiftPeriod(period, grain, steps))}
          canGoBack={period > firstPeriod}
          canGoForward={period < latestPeriod}
          onToday={period < latestPeriod ? () => changePeriod(latestPeriod) : undefined}
          currencies={currencies}
          currency={currency}
          onCurrency={changeCurrency}
        />

        <main className="view">
          {tab === 'overview' && (
            <>
              {toSort.length > 0 && (
                <button type="button" className="sort-banner" onClick={openSorter}>
                  <span aria-hidden="true">🗂️</span>
                  {toSort.length === 1 ? '1 store to sort' : `${toSort.length} stores to sort`}
                  <span className="sort-banner-go" aria-hidden="true">
                    ›
                  </span>
                </button>
              )}
              <section className="receipt">
                <Summary report={report} period={period} grain={grain} currency={currency} categories={categories} />
                <PeriodChart
                  series={report.series}
                  selected={grain === 'all' ? '' : period}
                  grain={report.chartGrain}
                  currency={currency}
                  usual={report.usual}
                  onSelect={selectChartPeriod}
                />
              </section>
              {toCheck > 0 && (
                <button type="button" className="check-card" onClick={() => focusOn({type: 'check'})}>
                  <span className="check-count">{toCheck}</span>
                  <span className="check-text">
                    <strong>{toCheck === 1 ? 'A payment to check' : 'Payments to check'}</strong>
                    <span>Tillroll guessed their category</span>
                  </span>
                  <span className="sort-banner-go" aria-hidden="true">
                    ›
                  </span>
                </button>
              )}
              <div className="columns">
                <CategoryBreakdown
                  {...breakdown}
                  preview={{limit: 5, onSeeAll: () => setTab('categories')}}
                  onEdit={() => setDialog({type: 'categories', store: null})}
                />
                <StoreBreakdown
                  {...breakdown}
                  preview={{limit: 5, onSeeAll: () => setTab('stores')}}
                  onEdit={() => setDialog({type: 'stores', store: null})}
                  onOpenStore={store => setDialog({type: 'store', store})}
                />
              </div>
              <LatestPayments
                rows={periodRows}
                categories={categories}
                onCategorize={(targets, category, scope) => void categorize(targets, category, scope)}
                onCreateCategory={(targets, label, icon, scope) => void createCategoryFor(targets, label, icon, scope)}
                showBanks={showBanks}
                labelNames={labelNames}
                onLabels={changes => void setLabels(changes)}
                onFocusLabel={label => focusOn({type: 'label', key: label})}
                onOpenStore={store => setDialog({type: 'store', store})}
                onSeeAll={() => {
                  setFocus(null);
                  setTab('payments');
                  window.scrollTo({top: 0});
                }}
              />
              <BudgetCard
                report={report}
                grain={grain}
                categories={categories}
                budgets={data?.budgets ?? {}}
                currency={currency}
                onEdit={() => {
                  setTab('categories');
                  window.scrollTo({top: 0});
                }}
              />
              <MoneyFlow report={report} grain={grain} currency={currency} />
              <FixedSplit report={report} grain={grain} currency={currency} />
              <RegularPayments
                subscriptions={report.subscriptions}
                currency={currency}
                onOpenStore={store => setDialog({type: 'store', store})}
              />
              <Insights insights={report.insights} />
            </>
          )}
          {tab === 'calendar' && (
            <Calendar
              rows={currencyRows}
              categories={categories}
              currency={currency}
              initialYear={(grain === 'all'
                ? lastDay
                : periodEnd(period, grain) < lastDay
                  ? periodEnd(period, grain)
                  : lastDay
              ).slice(0, 4)}
              labelNames={labelNames}
              onLabels={changes => void setLabels(changes)}
              onOpenMonth={month => {
                setGrain('month');
                saveGrain('month');
                changePeriod(month);
                setTab('overview');
                window.scrollTo({top: 0});
              }}
            />
          )}
          {tab === 'stats' && <FunStats rows={currencyRows} currency={currency} />}
          {tab === 'savings' && (
            <Savings
              rows={currencyRows}
              currency={currency}
              values={data?.savingsValues ?? {}}
              holders={holders}
              balances={data?.balances ?? []}
              onSave={(account, record) => void setSavings(account, record)}
            />
          )}
          {tab === 'categories' && (
            <>
              <CategoryBreakdown
                {...breakdown}
                onEdit={() => setDialog({type: 'categories', store: null})}
                onOpenCategory={category => setDialog({type: 'category', category})}
              />
              <BudgetCard
                report={report}
                grain={grain}
                categories={categories}
                budgets={data?.budgets ?? {}}
                currency={currency}
                onSave={(category, amount) => void setBudget(category, amount)}
              />
              <LabelList
                rows={currencyRows}
                currency={currency}
                onOpen={label => focusOn({type: 'label', key: label})}
                onRename={(label, newLabel) => void renameLabel(label, newLabel)}
                onDelete={label => void deleteLabel(label)}
              />
            </>
          )}
          {tab === 'stores' && (
            <StoreBreakdown
              {...breakdown}
              onEdit={() => setDialog({type: 'stores', store: focus?.type === 'store' ? focus.key : null})}
              onOpenStore={store => setDialog({type: 'store', store})}
              duplicates={duplicates.length}
              onDuplicates={() => setDialog({type: 'duplicates', pairs: duplicates})}
              merges={Object.keys(data?.merges ?? {}).length}
              onMerges={() => setDialog({type: 'merges'})}
            />
          )}
          {tab === 'payments' && (
            <Payments
              key={paymentsRun}
              rows={focus?.type === 'label' ? currencyRows : periodRows}
              allRows={currencyRows}
              onAllTime={() => changeGrain('all')}
              categories={categories}
              focus={focus}
              onClearFocus={() => setFocus(null)}
              onCategorize={(targets, category, scope) => void categorize(targets, category, scope)}
              onCreateCategory={(targets, label, icon, scope) => void createCategoryFor(targets, label, icon, scope)}
              onEditStore={key => setDialog({type: 'stores', store: key})}
              onOpenStore={store => setDialog({type: 'store', store})}
              labelNames={labelNames}
              onLabels={changes => void setLabels(changes)}
              onFocusLabel={label => focusOn({type: 'label', key: label})}
              onFocusCategory={category => setFocus(category ? {type: 'category', key: category} : null)}
              onFocusCheck={() => setFocus({type: 'check'})}
              showBanks={showBanks}
            />
          )}
        </main>

        <footer className="foot">
          <p>{footnote}</p>
        </footer>
      </div>

      <TabBar tab={tab} onTab={openTab} />

      {dialog?.type === 'categories' && (
        <CategoryEditor
          categories={categories}
          forStore={dialog.store?.name ?? null}
          onSave={(list, added) => void saveCategoryList(list, added)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'stores' && (
        <StoreEditor
          rows={rows}
          rules={data?.rules ?? {}}
          categories={categories}
          merges={data?.merges ?? {}}
          preselected={dialog.store}
          onRename={(storeKey, name, newName) => void renameStore(storeKey, name, newName)}
          onCategory={(storeKey, category) => void changeCategory(storeKey, category)}
          onMerge={(storeKeys, into) => void mergeStores(storeKeys, into)}
          onShowMerges={() => setDialog({type: 'merges'})}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'merges' && (
        <MergesDialog
          rows={rows}
          merges={data?.merges ?? {}}
          onSeparate={storeKey => void separateStore(storeKey)}
          onOpenStore={store => setDialog({type: 'store', store})}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'store' && (
        <StoreDialog
          store={dialog.store}
          rows={rows}
          rules={data?.rules ?? {}}
          categories={categories}
          onSave={(newName, category) => void editStore(dialog.store.key, dialog.store.name, newName, category)}
          onMore={() => setDialog({type: 'stores', store: dialog.store.key})}
          merges={data?.merges ?? {}}
          similar={duplicates
            .filter(pair => pair.first.key === dialog.store.key || pair.second.key === dialog.store.key)
            .map(pair => (pair.first.key === dialog.store.key ? pair.second : pair.first))}
          onSeparate={storeKey => void separateStore(storeKey)}
          onMergeInto={(storeKey, into) => void mergeStores([storeKey], into)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'category' && (
        <CategoryDialog
          category={dialog.category}
          rows={currencyRows}
          categories={categories}
          currency={currency}
          onOpenPayments={() => focusOn({type: 'category', key: dialog.category})}
          // The store dialog takes this one's place.
          onOpenStore={store => setDialog({type: 'store', store})}
          onClose={() => setDialog(null)}
        />
      )}
      {bankDialog}
      {dialog?.type === 'duplicates' && (
        <DuplicatesDeck
          pairs={dialog.pairs}
          categories={categories}
          onMerge={(storeKeys, into) => void mergeStores(storeKeys, into)}
          onDistinct={pair => void markDistinct(pair)}
          onCategory={(storeKey, category) => void changeCategory(storeKey, category)}
          onRename={(storeKey, name, newName) => void renameStore(storeKey, name, newName)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'sort' && (
        <Sorter
          queues={dialog.queues}
          categories={categories}
          rules={data?.rules ?? {}}
          onPick={(storeKey, category) => void changeCategory(storeKey, category)}
          onNewCategory={(storeKey, label, icon) => void addCategoryFor(storeKey, label, icon)}
          onRename={(storeKey, name, newName) => void renameStore(storeKey, name, newName)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
