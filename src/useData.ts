import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  disconnectBank,
  fetchOwnerData,
  importStatement,
  type OwnerData,
  RequestError,
  saveBudget,
  saveCategories,
  saveDistinct,
  saveLabels,
  saveMerge,
  savePaymentCategories,
  saveRule,
  saveSavingsValues,
  signIn,
  signOut,
  startBankConnection,
  syncBank,
} from './api';
import {type Category, categoriesFrom, editsFrom, newCategoryKey} from './categories';
import type {Focus} from './components/Breakdown';
import {findDuplicates} from './duplicates';
import {withLabel, withoutLabel} from './labels';
import {forgetOwnerKey, isOwnerBrowser, keepOwnerKey, pendingOwnerKey} from './owner';
import {forgetCachedOwnerData, loadCachedOwnerData, saveCachedOwnerData} from './ownerCache';
import {type Row, storesToSort, toRows} from './rows';
import {sampleTransactions} from './sample';
import {readStatement} from './statement';
import {loadLocalData, loadLocalSorting, saveLocalData, saveLocalSorting} from './storage';
import {mergedInto, storeKey as keyOfStore} from './stores';
import {withoutCoveredTotals, withoutOverlap} from './transactions';
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

export interface Data {
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

export interface Notice {
  tone: 'info' | 'error';
  text: string;
}

/** A sync older than this runs again when the owner opens the page. */
const SYNC_AFTER = 6 * 3_600_000;

/** The owner's data as the page holds it: fields an older server (or an older kept copy) may not have start empty. */
function fromOwner(owner: OwnerData): Data {
  return {
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
  };
}

function localData(): Data | null {
  const saved = loadLocalData();
  if (!saved) return null;
  const transactions = saved.source === 'sample' ? sampleTransactions() : saved.transactions;
  return {source: saved.source, transactions, ...loadLocalSorting(), connections: []};
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

/** What the data changes in the view: the payment list's filter, and going back to the latest period. */
interface View {
  focus: Focus | null;
  setFocus: (focus: Focus | null) => void;
  /** The latest period and no filter, once other data comes in. */
  resetView: () => void;
}

/**
 * The data Tillroll shows and every way to change it: the owner's (loaded, kept on the device, synced from the banks,
 * saved to the store) or a visitor's (the sample or their statements, in their browser), with the rows read from it
 * and what the views need from them. A change shows at once, then saves.
 */
export function useData({focus, setFocus, resetView}: View) {
  const [isOwner, setIsOwner] = useState(isOwnerBrowser);
  const [data, setData] = useState<Data | null>(() => (isOwnerBrowser() ? null : localData()));
  const [loading, setLoading] = useState(isOwner);
  const [notice, setNotice] = useState<Notice | null>(noticeFromAddress);
  const [busy, setBusy] = useState<string | null>(null);

  /** Back to the public version, for instance after the owner key changed. */
  const leaveOwnerMode = useCallback((message: string) => {
    forgetOwnerKey();
    void forgetCachedOwnerData();
    void signOut().catch(() => undefined);
    setIsOwner(false);
    setData(localData());
    setLoading(false);
    setNotice({tone: 'error', text: message});
  }, []);

  // Changes being saved: a load that overlaps one starts again, since its answer may not have it (see change).
  const edits = useRef(0);

  const loadOwner = useCallback(async () => {
    try {
      let owner: OwnerData;
      let before: number;
      do {
        before = edits.current;
        owner = await fetchOwnerData();
      } while (edits.current !== before);
      setData(fromOwner(owner));
      void saveCachedOwnerData(owner);
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
      // The data kept on this device from the last visit shows at once; the fresh data replaces it when it comes.
      const cached = await loadCachedOwnerData();
      if (cached) {
        setData(fromOwner(cached));
        setLoading(false);
      }
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

  /** Shows a change at once, then saves it: in the store for the owner, in the browser for a visitor. */
  async function change(update: Partial<Data>, saveOnServer: () => Promise<unknown>) {
    if (!data) return;
    setData(previous => previous && {...previous, ...update});
    if (data.source !== 'owner') {
      saveLocalSorting(update);
      return;
    }
    edits.current += 1;
    try {
      await saveOnServer();
    } catch (error) {
      setNotice({tone: 'error', text: messageOf(error)});
    } finally {
      edits.current += 1;
    }
  }

  async function changeCategory(storeKey: string, category: CategoryKey | null) {
    if (!data) return;
    const rules = {...data.rules};
    if (category) rules[storeKey] = category;
    else delete rules[storeKey];
    await change({rules}, () => saveRule(storeKey, category));
  }

  /** The category list as the editor leaves it. */
  async function saveCategoryList(list: Category[]) {
    const edits = editsFrom(list);
    await change({categories: edits}, () => saveCategories(edits));
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
      resetView();
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
    resetView();
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
    resetView();
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
    await forgetCachedOwnerData();
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

  return {
    isOwner,
    data,
    loading,
    notice,
    setNotice,
    busy,
    categories,
    rows,
    holders,
    labelNames,
    duplicates,
    toSort,
    sync,
    changeCategory,
    saveCategoryList,
    mergeStores,
    setSavings,
    setBudget,
    markDistinct,
    categorize,
    createCategoryFor,
    renameLabel,
    deleteLabel,
    setLabels,
    separateStore,
    renameStore,
    editStore,
    addCategoryFor,
    importFile,
    showSample,
    clearLocal,
    connect,
    enterOwnerKey,
    leaveOwnerView,
    disconnect,
  };
}
