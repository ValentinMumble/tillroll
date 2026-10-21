import { createHash, createSign } from 'node:crypto'
import type { Kind, Transaction } from '../../src/types'
import { env, HttpError } from './http.js'

/**
 * Enable Banking (https://enablebanking.com/docs/api/reference/): Open Banking access to the owner's bank account.
 * In restricted mode, free, an application only reads the accounts its owner linked in the Control Panel.
 */
const API = 'https://api.enablebanking.com'

/** The bank session, kept in Redis after the owner authorizes access. */
export interface Session {
  id: string
  validUntil: string
  bank: { name: string; country: string }
  /** The PSU headers the bank wants on a fetch the owner starts (see psuHeaders). */
  requiredHeaders: string[]
  accounts: { uid: string; hash: string; name: string; currency: string }[]
  expired?: boolean
  /** When the last sync of this bank ran (ISO date-time), null before the first. */
  syncedAt?: string | null
}

interface Aspsp {
  name: string
  country: string
  maximum_consent_validity: number
  required_psu_headers?: string[]
}

interface BankAccount {
  uid: string
  identification_hash: string
  name?: string | null
  product?: string | null
  currency: string
}

interface Party {
  name?: string | null
}

interface BankTransaction {
  entry_reference?: string | null
  merchant_category_code?: string | null
  transaction_amount: { currency: string; amount: string }
  creditor?: Party | null
  debtor?: Party | null
  creditor_account?: { iban?: string | null } | null
  credit_debit_indicator: 'CRDT' | 'DBIT'
  status: string
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: string[] | null
  bank_transaction_code?: { description?: string | null } | null
}

/** An error answer of Enable Banking, with its error code (EXPIRED_SESSION, ASPSP_RATE_LIMIT_EXCEEDED...). */
export class BankError extends HttpError {
  constructor(
    status: number,
    message: string,
    readonly code: string,
  ) {
    super(status, message)
  }
}

/** A token signed with the application's private key, valid one hour (Enable Banking accepts up to 24). */
function token() {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ typ: 'JWT', alg: 'RS256', kid: env('ENABLE_BANKING_APP_ID') })
  const body = encode({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 })
  // A .env file may hold the key on one line, with \n for the line breaks.
  const key = env('ENABLE_BANKING_PRIVATE_KEY').replace(/\\n/g, '\n')
  let signature: string
  try {
    signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(key, 'base64url')
  } catch {
    // A Vercel secret pulled into .env.local comes as an empty placeholder: the bank calls run on the site.
    throw new HttpError(503, 'The Enable Banking key is not readable here: connect and sync banks on the site')
  }
  return `${header}.${body}.${signature}`
}

async function call<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token()}`, Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...headers, ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const { error, message, detail } = data as { error?: string; message?: string; detail?: unknown }
    const text = [message, typeof detail === 'string' ? detail : null].filter(Boolean).join(': ')
    console.error('Enable Banking', response.status, path, JSON.stringify(data))
    throw new BankError(502, `Enable Banking: ${text || `answered ${response.status}`}`, error ?? '')
  }
  return data as T
}

/** The banks Enable Banking can read personal accounts of, in a country. */
async function banksIn(country: string) {
  const { aspsps } = await call<{ aspsps: Aspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country.toUpperCase())}&psu_type=personal&service=AIS`,
  )
  return aspsps
}

/** The names of the banks of a country, for the page's bank picker. */
export async function bankNames(country: string) {
  return (await banksIn(country)).map((bank) => bank.name).sort((first, second) => first.localeCompare(second))
}

/** The bank to connect, as Enable Banking lists it for the country (BANK_NAME and BANK_COUNTRY by default). */
async function findBank(name?: string, country?: string) {
  const wanted = (name || process.env.BANK_NAME || 'Revolut').toLowerCase()
  const where = (country || process.env.BANK_COUNTRY || 'FR').toUpperCase()
  const aspsps = await banksIn(where)
  const bank =
    aspsps.find((item) => item.name.toLowerCase() === wanted) ??
    aspsps.find((item) => item.name.toLowerCase().includes(wanted))
  if (!bank) throw new HttpError(502, `Enable Banking lists no bank named ${wanted} in ${where}`)
  return bank
}

/** Starts an authorization: the owner goes to the returned address, logs in to the bank and comes back. */
export async function startAuthorization(
  redirectUrl: string,
  state: string,
  wanted?: { name?: string; country?: string },
) {
  const bank = await findBank(wanted?.name, wanted?.country)
  // The longest access the bank allows (often 180 days), less a minute for the clock difference.
  const validUntil = new Date(Date.now() + bank.maximum_consent_validity * 1000 - 60_000).toISOString()
  const { url } = await call<{ url: string }>('/auth', {
    method: 'POST',
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    },
  })
  return { url, requiredHeaders: bank.required_psu_headers ?? [] }
}

/** Turns the code the bank sends back into a session. */
export async function createSession(code: string, requiredHeaders: string[]): Promise<Session> {
  const answer = await call<{
    session_id: string
    accounts: BankAccount[]
    aspsp: { name: string; country: string }
    access: { valid_until: string }
  }>('/sessions', { method: 'POST', body: { code } })
  return {
    id: answer.session_id,
    validUntil: answer.access.valid_until,
    bank: answer.aspsp,
    requiredHeaders,
    accounts: answer.accounts.map((account) => ({
      uid: account.uid,
      hash: account.identification_hash,
      name: account.name || account.product || account.currency,
      currency: account.currency,
    })),
    syncedAt: null,
  }
}

export async function closeSession(id: string) {
  await call(`/sessions/${id}`, { method: 'DELETE' })
}

/**
 * The headers that say the owner is there and started the fetch. Many banks allow only 4 fetches a day without
 * them. The bank wants all of its required headers or none: when one is missing, the fetch goes without any.
 */
export function psuHeaders(request: Request, required: string[]) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const values: Record<string, string | null | undefined> = {
    'psu-ip-address': ip,
    'psu-user-agent': request.headers.get('user-agent'),
    'psu-referer': request.headers.get('referer'),
    'psu-accept': request.headers.get('accept'),
    'psu-accept-charset': request.headers.get('accept-charset'),
    'psu-accept-encoding': request.headers.get('accept-encoding'),
    'psu-accept-language': request.headers.get('accept-language'),
  }
  if (!ip || required.some((name) => !values[name.toLowerCase()])) return {}
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])))
}

/** All transactions of an account since a day, or as far back as the bank allows when there is no day. */
export async function fetchTransactions(uid: string, since: string | null, headers: Record<string, string>) {
  const items: BankTransaction[] = []
  let continuationKey: string | null = null
  // A guard against a bank that keeps answering with a key: 200 pages is years of history.
  for (let page = 0; page < 200; page += 1) {
    const query = new URLSearchParams(since ? { date_from: since } : { strategy: 'longest' })
    if (continuationKey) query.set('continuation_key', continuationKey)
    const answer: { transactions: BankTransaction[]; continuation_key?: string | null } = await call(
      `/accounts/${uid}/transactions?${query}`,
      { headers },
    )
    items.push(...answer.transactions)
    continuationKey = answer.continuation_key ?? null
    if (!continuationKey) break
  }
  return items
}

function kindOf(item: BankTransaction, amount: number, text: string): Kind {
  const mcc = item.merchant_category_code
  if (mcc === '6010' || mcc === '6011' || /\batm\b|cash withdrawal|retrait/i.test(text)) return 'atm'
  if (mcc) return amount < 0 ? 'card' : 'refund'
  if (/\bexchanged?\b/i.test(text)) return 'exchange'
  if (/top.?up/i.test(text)) return 'topup'
  if (amount > 0) return /refund|rembours/i.test(text) ? 'refund' : 'income'
  // A card payment has no account on the other side: a payment to an IBAN is a transfer.
  if (item.creditor_account?.iban || /^(to|transfer to|virement|vir)\b|\b(pocket|vault|savings)\b/i.test(text)) {
    return 'transfer'
  }
  return 'card'
}

/** The bank's transaction in Tillroll's shape, or null for a cancelled or rejected one. */
export function toTransaction(item: BankTransaction, accountHash: string, bank: string): Transaction | null {
  if (['RJCT', 'CNCL'].includes(item.status)) return null
  const date = item.transaction_date ?? item.booking_date ?? item.value_date
  if (!date) return null
  const size = Math.abs(Number(item.transaction_amount.amount))
  const amount = item.credit_debit_indicator === 'DBIT' ? -size : size
  const party = item.credit_debit_indicator === 'DBIT' ? item.creditor : item.debtor
  const description =
    [party?.name, ...(item.remittance_information ?? []), item.bank_transaction_code?.description]
      .map((text) => text?.trim())
      .find(Boolean) ?? 'Unknown'
  // entry_reference is stable for booked transactions; a pending one gets an id from its content.
  const reference =
    item.entry_reference ?? createHash('sha1').update(`${date}|${amount}|${description}`).digest('hex').slice(0, 16)
  return {
    id: `bank:${accountHash.slice(0, 12)}:${reference}`,
    date: date.slice(0, 10),
    amount,
    currency: item.transaction_amount.currency,
    description,
    kind: kindOf(item, amount, description),
    mcc: item.merchant_category_code ?? null,
    pending: item.status === 'PDNG',
    source: 'bank',
    bank,
  }
}
