import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  disconnectBank,
  fetchOwnerData,
  importStatement,
  RequestError,
  saveRule,
  startBankConnection,
  syncBank,
} from './api'
import { CategoryBreakdown, type Focus, StoreBreakdown } from './components/Breakdown'
import { ImportButton } from './components/ImportButton'
import { Insights } from './components/Insights'
import { Landing } from './components/Landing'
import { Payments } from './components/Payments'
import { PeriodChart } from './components/PeriodChart'
import { Summary } from './components/Summary'
import { Toolbar } from './components/Toolbar'
import { timeAgo } from './format'
import { forgetOwnerKey, ownerKey } from './owner'
import { type Grain, periodEnd, periodOf, shiftPeriod, today } from './periods'
import { buildReport, rowsBetween, toRows } from './report'
import { sampleTransactions } from './sample'
import { readStatement } from './statement'
import { loadGrain, loadLocalData, loadLocalRules, saveGrain, saveLocalData, saveLocalRules } from './storage'
import type { CategoryKey, Connection, Rules, Transaction } from './types'

interface Data {
  source: 'sample' | 'statement' | 'owner'
  transactions: Transaction[]
  rules: Rules
  connection: Connection | null
}

interface Notice {
  tone: 'info' | 'error'
  text: string
}

/** A sync older than this runs again when the owner opens the page. */
const SYNC_AFTER = 6 * 3_600_000

function localData(): Data | null {
  const saved = loadLocalData()
  if (!saved) return null
  const transactions = saved.source === 'sample' ? sampleTransactions() : saved.transactions
  return { source: saved.source, transactions, rules: loadLocalRules(), connection: null }
}

/** The owner's statement rows stop where the bank's history starts, per currency, so nothing counts twice. */
function withoutOverlap(transactions: Transaction[]) {
  const bankStart = new Map<string, string>()
  for (const item of transactions) {
    const start = bankStart.get(item.currency)
    if (item.source === 'bank' && (!start || item.date < start)) bankStart.set(item.currency, item.date)
  }
  return transactions.filter((item) => {
    const start = bankStart.get(item.currency)
    return item.source !== 'statement' || !start || item.date < start
  })
}

/** The message /api/callback leaves in the address when the bank sends the owner back. */
function noticeFromAddress(): Notice | null {
  const query = new URLSearchParams(window.location.search)
  const error = query.get('bank-error')
  const connected = query.get('bank') === 'connected'
  if (!error && !connected) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  if (error) return { tone: 'error', text: error }
  return { tone: 'info', text: `Revolut is connected: ${query.get('count') ?? 'its'} transactions synced.` }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

export default function App() {
  const [isOwner, setIsOwner] = useState(() => Boolean(ownerKey()))
  const [data, setData] = useState<Data | null>(() => (ownerKey() ? null : localData()))
  const [loading, setLoading] = useState(isOwner)
  const [notice, setNotice] = useState<Notice | null>(noticeFromAddress)
  const [busy, setBusy] = useState<string | null>(null)
  const [grain, setGrain] = useState<Grain>(loadGrain)
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null)
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)

  const loadOwner = useCallback(async () => {
    try {
      const owner = await fetchOwnerData()
      setData({ source: 'owner', ...owner })
      return owner
    } catch (error) {
      if (error instanceof RequestError && error.status === 403) {
        forgetOwnerKey()
        setIsOwner(false)
        setData(localData())
        setNotice({ tone: 'error', text: 'This owner key is not valid: you see the public version.' })
      } else setNotice({ tone: 'error', text: messageOf(error) })
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const sync = useCallback(async () => {
    setBusy('sync')
    try {
      const result = await syncBank()
      await loadOwner()
      return result
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) })
      return null
    } finally {
      setBusy(null)
    }
  }, [loadOwner])

  // Once, when the page opens (StrictMode runs effects twice in development: one sync is enough).
  const started = useRef(false)
  useEffect(() => {
    if (!isOwner || started.current) return
    started.current = true
    const start = async () => {
      const owner = await loadOwner()
      const connection = owner?.connection
      const stale = !connection?.syncedAt || Date.now() - Date.parse(connection.syncedAt) > SYNC_AFTER
      if (connection && !connection.expired && stale) await sync()
    }
    void start()
  }, [isOwner, loadOwner, sync])

  const rows = useMemo(() => {
    if (!data) return []
    return toRows(data.source === 'owner' ? withoutOverlap(data.transactions) : data.transactions, data.rules)
  }, [data])

  // Currencies by number of payments: the main account first.
  const currencies = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1)
    return [...counts].sort((first, second) => second[1] - first[1]).map(([currency]) => currency)
  }, [rows])
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? 'EUR')
  const currencyRows = useMemo(() => rows.filter((row) => row.currency === currency), [rows, currency])

  const lastDay = currencyRows[0]?.date ?? today()
  const firstDay = currencyRows.at(-1)?.date ?? lastDay
  const latestPeriod = periodOf(lastDay, grain)
  const firstPeriod = periodOf(firstDay, grain)
  const period =
    chosenPeriod && chosenPeriod >= firstPeriod && chosenPeriod <= latestPeriod ? chosenPeriod : latestPeriod
  const report = useMemo(() => buildReport(currencyRows, period, grain, today()), [currencyRows, period, grain])
  const periodRows = useMemo(() => rowsBetween(currencyRows, report.from, report.to), [currencyRows, report])

  function changeGrain(next: Grain) {
    if (next === grain) return
    const end = periodEnd(period, grain)
    setChosenPeriod(periodOf(end < lastDay ? end : lastDay, next))
    setGrain(next)
    saveGrain(next)
  }

  function changePeriod(next: string) {
    setChosenPeriod(next)
    setFocus(null)
  }

  async function changeCategory(storeKey: string, category: CategoryKey | null) {
    if (!data) return
    const rules = { ...data.rules }
    if (category) rules[storeKey] = category
    else delete rules[storeKey]
    setData({ ...data, rules })
    if (data.source !== 'owner') {
      saveLocalRules(rules)
      return
    }
    try {
      await saveRule(storeKey, category)
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) })
    }
  }

  async function importFile(file: File) {
    setBusy('import')
    try {
      const transactions = await readStatement(file)
      let kept = true
      if (isOwner) {
        await importStatement(transactions)
        await loadOwner()
      } else {
        // A new statement adds to the earlier ones: overlapping months keep one copy of each payment.
        const earlier = data?.source === 'statement' ? data.transactions : []
        const merged = [...new Map([...earlier, ...transactions].map((item) => [item.id, item])).values()]
        kept = saveLocalData({ source: 'statement', transactions: merged })
        setData({ source: 'statement', transactions: merged, rules: data?.rules ?? loadLocalRules(), connection: null })
      }
      setChosenPeriod(null)
      setFocus(null)
      const warning = kept
        ? ''
        : ' Your browser does not let Tillroll keep them, so they last until you close the page.'
      setNotice({ tone: 'info', text: `${transactions.length} transactions read from ${file.name}.${warning}` })
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) })
    } finally {
      setBusy(null)
    }
  }

  function showSample() {
    saveLocalData({ source: 'sample' })
    setData({ source: 'sample', transactions: sampleTransactions(), rules: loadLocalRules(), connection: null })
    setChosenPeriod(null)
    setNotice(null)
  }

  function clearLocal() {
    const question =
      data?.source === 'statement'
        ? 'Remove the imported statements and your category choices from this browser?'
        : 'Leave the sample data?'
    if (!window.confirm(question)) return
    saveLocalData(null)
    if (data?.source === 'statement') saveLocalRules({})
    setData(null)
    setFocus(null)
    setChosenPeriod(null)
  }

  async function connect() {
    setBusy('connect')
    try {
      window.location.assign(await startBankConnection())
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) })
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!window.confirm('End the access to Revolut? The transactions synced so far stay.')) return
    try {
      await disconnectBank()
      await loadOwner()
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) })
    }
  }

  const connection = data?.connection ?? null
  const hasData = currencyRows.length > 0

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            💸
          </span>
          Tillroll
        </a>
        <div className="top-actions">
          {isOwner && connection && (
            <>
              <span className="status">
                {connection.expired
                  ? 'Access to Revolut expired'
                  : `${connection.bank} · ${connection.syncedAt ? `synced ${timeAgo(connection.syncedAt)}` : 'not synced yet'}`}
              </span>
              {connection.expired ? (
                <button type="button" className="button is-primary" disabled={busy !== null} onClick={connect}>
                  Reconnect
                </button>
              ) : (
                <button type="button" className="button" disabled={busy !== null} onClick={() => void sync()}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync'}
                </button>
              )}
            </>
          )}
          {isOwner && !connection && hasData && (
            <button type="button" className="button is-primary" disabled={busy !== null} onClick={connect}>
              Connect Revolut
            </button>
          )}
          {!isOwner && data && (
            <span className="status">{data.source === 'sample' ? 'Sample data' : 'Your statement'}</span>
          )}
          {hasData && <ImportButton label="Import statement" busy={busy === 'import'} onFile={importFile} />}
          {!isOwner && data && (
            <button type="button" className="button is-quiet" onClick={clearLocal}>
              {data.source === 'sample' ? 'Leave sample' : 'Remove data'}
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className={`notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <p>{notice.text}</p>
          <button type="button" aria-label="Close" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      <main>
        {loading ? (
          <p className="loading">Loading your spending…</p>
        ) : !hasData ? (
          <Landing isOwner={isOwner} busy={busy} onSample={showSample} onImport={importFile} onConnect={connect} />
        ) : (
          <>
            <Toolbar
              grain={grain}
              onGrain={changeGrain}
              period={period}
              onStep={(steps) => changePeriod(shiftPeriod(period, grain, steps))}
              canGoBack={period > firstPeriod}
              canGoForward={period < latestPeriod}
              currencies={currencies}
              currency={currency}
              onCurrency={(next) => {
                setChosenCurrency(next)
                setChosenPeriod(null)
                setFocus(null)
              }}
            />
            <div className="overview">
              <section className="receipt">
                <Summary report={report} period={period} grain={grain} currency={currency} />
                <PeriodChart
                  series={report.series}
                  selected={period}
                  grain={grain}
                  currency={currency}
                  usual={report.usual}
                  onSelect={changePeriod}
                />
              </section>
              <Insights insights={report.insights} />
            </div>
            <div className="columns">
              <CategoryBreakdown report={report} currency={currency} focus={focus} onFocus={setFocus} />
              <StoreBreakdown report={report} currency={currency} focus={focus} onFocus={setFocus} />
            </div>
            <Payments
              rows={periodRows}
              rules={data?.rules ?? {}}
              focus={focus}
              onClearFocus={() => setFocus(null)}
              onCategory={(storeKey, category) => void changeCategory(storeKey, category)}
            />
          </>
        )}
      </main>

      <footer className="foot">
        <p>
          {isOwner
            ? 'Owner view: your synced account and statements, kept in the site store.'
            : 'Tillroll reads Revolut statements in your browser. Nothing you import leaves it.'}{' '}
          <a href="https://github.com/ValentinMumble/tillroll">Source on GitHub</a>
          {isOwner && connection && (
            <>
              {' · '}
              <button type="button" className="link-button" onClick={() => void disconnect()}>
                Disconnect Revolut
              </button>
            </>
          )}
        </p>
      </footer>
    </div>
  )
}
