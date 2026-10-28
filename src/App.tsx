import {useCallback, useEffect, useMemo, useState} from 'react';
import type {Category} from './categories';
import {BankDialog} from './components/BankDialog';
import {CategoryBreakdown, type Focus, StoreBreakdown} from './components/Breakdown';
import {BudgetCard} from './components/Budgets';
import {Calendar} from './components/Calendar';
import {CategoryDialog} from './components/CategoryDialog';
import {CategoryEditor} from './components/CategoryEditor';
import {DuplicatesDeck} from './components/DuplicatesDeck';
import {FunStats} from './components/FunStats';
import {ImportButton} from './components/ImportButton';
import {LabelList} from './components/LabelList';
import {Landing} from './components/Landing';
import {Logo} from './components/Logo';
import {Menu} from './components/Menu';
import {MergesDialog} from './components/MergesDialog';
import {Overview} from './components/Overview';
import {Payments} from './components/Payments';
import {PullToRefresh} from './components/PullToRefresh';
import {Savings} from './components/Savings';
import {Sidebar} from './components/Sidebar';
import {OverviewSkeleton} from './components/Skeleton';
import {Sorter} from './components/Sorter';
import {StoreDialog} from './components/StoreDialog';
import {StoreEditor} from './components/StoreEditor';
import {TabBar} from './components/TabBar';
import {Toolbar} from './components/Toolbar';
import {isHomeScreenApp} from './device';
import type {Pair} from './duplicates';
import {timeAgo} from './format';
import {type Grain, periodEnd, periodOf, shiftPeriod, today} from './periods';
import {buildReport} from './report';
import {isUnsure, rowsBetween, type StoreToSort, storesToSort} from './rows';
import {loadGrain, saveGrain, savePaymentSort} from './storage';
import {MENU_ONLY, type Tab, TABS} from './tabs';
import type {CategoryKey} from './types';
import {useData} from './useData';

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

/**
 * Tillroll: one view at a time (picked in the sidebar or the tab bar) of the data useData holds, for the period, the
 * currency and the filter picked here, with the dialogs that change it.
 */
export default function App() {
  const [homeScreenApp] = useState(isHomeScreenApp);
  const [grain, setGrain] = useState<Grain>(loadGrain);
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(() => placeFromHistory().focus);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // One view at a time: picked in the sidebar on wide screens, in the tab bar on a phone.
  const [tab, setTab] = useState<Tab>(() => placeFromHistory().tab);
  // Bumped to start the payment list over: a new key gives it a fresh search and no ticks.
  const [paymentsRun, setPaymentsRun] = useState(0);
  /** The latest period and no filter, once other data comes in. */
  const resetView = useCallback(() => {
    setChosenPeriod(null);
    setFocus(null);
  }, []);
  const {
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
    saveCategoryList: saveCategories,
    mergeStores,
    setSavings,
    setBudget,
    markDistinct,
    categorize,
    setPayback,
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
  } = useData({focus, setFocus, resetView});

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

  /** Another period. The filter stays (a category, a store, a label), to follow the same payments from year to year. */
  function changePeriod(next: string) {
    setChosenPeriod(next);
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

  /** The category editor's Save: a category added from a payment's list is picked for that store too. */
  async function saveCategoryList(list: Category[], added: CategoryKey | null) {
    await saveCategories(list);
    if (added && dialog?.type === 'categories' && dialog.store) await changeCategory(dialog.store.key, added);
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
  // Reconnecting and syncing stay in view on a phone; adding a bank goes in the header's ⋯ menu there. The
  // home-screen app syncs with a pull at the top of the page: its header leaves the Sync button to the ⋯ menu.
  const reconnectActions =
    isOwner &&
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
    ));
  const canSync = isOwner && live.length > 0;
  const syncButton = canSync && (
    <button type="button" className="button" disabled={busy !== null} onClick={() => void sync()}>
      {busy === 'sync' ? 'Syncing…' : 'Sync'}
    </button>
  );
  const syncAction = (
    <>
      {reconnectActions}
      {syncButton}
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
        {reconnectActions}
        {!homeScreenApp && syncButton}
        <Menu label="More">
          {isOwner && status && <p className="menu-status">{status}</p>}
          {homeScreenApp && canSync && (
            <button type="button" className="button is-quiet" disabled={busy !== null} onClick={() => void sync()}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
          )}
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
        <PullToRefresh
          // The owner's refresh fetches the banks' latest payments; anyone else's loads the page again.
          onRefresh={isOwner && data?.connections?.length ? sync : async () => window.location.reload()}
        />
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
            <Overview
              report={report}
              period={period}
              grain={grain}
              currency={currency}
              categories={categories}
              rows={periodRows}
              allRows={currencyRows}
              balances={data?.balances ?? []}
              budgets={data?.budgets ?? {}}
              toSort={toSort.length}
              toCheck={toCheck}
              showBanks={showBanks}
              labelNames={labelNames}
              focus={focus}
              onFocus={focusOn}
              onShow={next => {
                openTab(next);
                window.scrollTo({top: 0});
              }}
              onSeeAllPayments={() => {
                setFocus(null);
                setTab('payments');
                window.scrollTo({top: 0});
              }}
              onSelectPeriod={selectChartPeriod}
              onSort={openSorter}
              onOpenStore={store => setDialog({type: 'store', store})}
              onEditCategories={() => setDialog({type: 'categories', store: null})}
              onEditStores={() => setDialog({type: 'stores', store: null})}
              onCategorize={(targets, category, scope) => void categorize(targets, category, scope)}
              onCreateCategory={(targets, label, icon, scope) => void createCategoryFor(targets, label, icon, scope)}
              onLabels={changes => void setLabels(changes)}
              onPayback={(row, paymentId) => void setPayback(row, paymentId)}
            />
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
                setFocus(null);
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
              onPayback={(row, paymentId) => void setPayback(row, paymentId)}
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
          // A look-alike opened from the dialog starts afresh, with its own name and category.
          key={dialog.store.key}
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
          onOpenStore={store => setDialog({type: 'store', store})}
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
