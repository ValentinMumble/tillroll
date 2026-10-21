import type { Kind, Transaction } from './types'
import { readZip } from './zip'

/**
 * Reads a bank statement, in the browser. A Revolut account statement (in the app: the account, ···, Statement,
 * Excel or CSV), as CSV or as an Excel workbook: Type, Product, Started Date, Completed Date, Description, Amount,
 * Fee, Currency, State, Balance. Or Crédit Coopératif's CSV export (see fromCreditCooperatif).
 */

const COLUMNS = {
  type: ['type'],
  product: ['product', 'produit'],
  started: ['started date', 'date started', 'date de debut', 'date'],
  completed: ['completed date', 'date completed', 'date de fin', 'date de realisation'],
  description: ['description', 'libelle'],
  amount: ['amount', 'montant'],
  fee: ['fee', 'fees', 'frais'],
  currency: ['currency', 'devise'],
  state: ['state', 'etat', 'statut', 'status'],
}

const KINDS: Record<string, Kind> = {
  CARD_PAYMENT: 'card',
  CARD_REFUND: 'refund',
  REFUND: 'refund',
  TOPUP: 'topup',
  EXCHANGE: 'exchange',
  ATM: 'atm',
  FEE: 'fee',
  TRANSFER: 'transfer',
  CASHBACK: 'income',
  REWARD: 'income',
  INTEREST: 'income',
}

const SKIPPED_STATES = ['REVERTED', 'DECLINED', 'FAILED', 'CANCELLED', 'ANNULE', 'REFUSE']

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

/** CSV text as rows of cells: quoted fields, doubled quotes, line breaks inside quotes. */
function csvRows(text: string): string[][] {
  const source = text.replace(/^﻿/, '')
  const firstLine = source.slice(0, source.indexOf('\n'))
  const separator = [',', ';', '\t'].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  )
  const rows: string[][] = []
  let cells: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
    } else if (char === '"') quoted = true
    else if (char === separator) {
      cells.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      cells.push(field)
      rows.push(cells)
      cells = []
      field = ''
    } else field += char
  }
  if (field || cells.length) {
    cells.push(field)
    rows.push(cells)
  }
  return rows
}

/** The first sheet of an Excel workbook as rows of cells. */
async function xlsxRows(file: Blob): Promise<string[][]> {
  const files = await readZip(file, (name) => name === 'xl/sharedStrings.xml' || name === 'xl/worksheets/sheet1.xml')
  const sheet = files.get('xl/worksheets/sheet1.xml')
  if (!sheet) throw new Error('This workbook has no sheet to read')
  const parser = new DOMParser()
  const shared = [
    ...parser
      .parseFromString(files.get('xl/sharedStrings.xml') ?? '<sst/>', 'application/xml')
      .getElementsByTagName('si'),
  ].map((item) => [...item.getElementsByTagName('t')].map((part) => part.textContent ?? '').join(''))
  const rows: string[][] = []
  for (const row of parser.parseFromString(sheet, 'application/xml').getElementsByTagName('row')) {
    const cells: string[] = []
    for (const cell of row.getElementsByTagName('c')) {
      const letters = /^[A-Z]+/.exec(cell.getAttribute('r') ?? '')?.[0] ?? ''
      const column = [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
      const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
      const type = cell.getAttribute('t')
      cells[column < 0 ? cells.length : column] =
        type === 's' ? (shared[Number(value)] ?? '') : type === 'inlineStr' ? (cell.textContent ?? '') : value
    }
    rows.push(Array.from(cells, (cell) => cell ?? ''))
  }
  return rows
}

/** "2026-10-12 14:03:22", "12/10/2026" or an Excel day number, as YYYY-MM-DD. */
function parseDate(text: string) {
  const value = text.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dayFirst = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(value)
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    return new Date(Math.round((Number(value) - 25569) * 86_400_000)).toISOString().slice(0, 10)
  }
  return null
}

/** The time in "2026-10-12 14:03:22" (or in an Excel day number's fraction), as HH:MM. */
function parseTime(text: string) {
  const value = text.trim()
  const clock = /[ T](\d{1,2}):(\d{2})/.exec(value)
  if (clock) return `${clock[1].padStart(2, '0')}:${clock[2]}`
  const fraction = /^\d{5}\.(\d+)$/.exec(value)
  if (!fraction) return undefined
  const minutes = Math.round(Number(`0.${fraction[1]}`) * 24 * 60) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** "-1,234.56", "-1 234,56" or "12,5", as a number. */
function parseAmount(text: string) {
  const value = text.replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '')
  if (!value) return 0
  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')
  const normal = lastComma > lastDot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '')
  return Number(normal)
}

/** A short stable hash (cyrb53), for statement ids. */
function hash(text: string) {
  let first = 0xdeadbeef
  let second = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 2654435761)
    second = Math.imul(second ^ code, 1597334677)
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36)
}

/** Crédit Coopératif's columns, and its kinds of operation. */
const CREDIT_COOPERATIF = {
  booked: 'date de comptabilisation',
  label: 'libelle simplifie',
  operation: 'libelle operation',
  reference: 'reference',
  type: 'type operation',
  category: 'categorie',
  subcategory: 'sous categorie',
  debit: 'debit',
  credit: 'credit',
  date: 'date operation',
}

const CREDIT_COOPERATIF_KINDS: Record<string, Kind> = {
  virement: 'transfer',
  'virement recu': 'income',
  prelevement: 'card',
  cheque: 'card',
  'frais bancaires': 'fee',
  "retrait d'especes": 'atm',
  "depot d'especes": 'income',
}

/** The last day of the month before a day. */
function monthBefore(date: string) {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10)
}

/**
 * Crédit Coopératif's CSV export: one line per booked operation, a Debit and a Credit column, and the bank's own
 * category. Card payments are not listed one by one: a deferred debit at the start of each month pays the card's
 * payments of the month before, so it becomes one payment on that month's last day ("Carte ...7497 (débit
 * différé)"). Card refunds do come one by one.
 */
function fromCreditCooperatif(rows: string[][], headerIndex: number): Transaction[] {
  const header = rows[headerIndex].map(plain)
  const column = Object.fromEntries(
    Object.entries(CREDIT_COOPERATIF).map(([name, title]) => [name, header.indexOf(title)]),
  ) as Record<keyof typeof CREDIT_COOPERATIF, number>
  const cell = (row: string[], name: keyof typeof CREDIT_COOPERATIF) =>
    column[name] >= 0 ? (row[column[name]] ?? '').trim() : ''
  const seen = new Map<string, number>()
  const transactions: Transaction[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const booked = parseDate(cell(row, 'booked'))
    const amount = Math.round((parseAmount(cell(row, 'debit')) || parseAmount(cell(row, 'credit'))) * 100) / 100
    if (!booked || !amount) continue
    const type = plain(cell(row, 'type'))
    const subcategory = plain(cell(row, 'subcategory'))
    // The operation's label words it like the bank sync ("PRLV BPCE Vie", "VIR SEPA AKENEO"): rules and merges made on
    // synced stores then hold for the statement's months too.
    const label = cell(row, 'operation') || cell(row, 'label') || 'Unknown'
    const deferred = subcategory === 'transaction differee'
    let kind: Kind =
      type === 'carte bancaire' ? (amount < 0 ? 'card' : 'refund') : (CREDIT_COOPERATIF_KINDS[type] ?? 'card')
    if (subcategory === 'remboursements de soins') kind = 'refund'
    if (subcategory === 'virement interne') kind = 'transfer'
    const card = /\.{3}\d+/.exec(cell(row, 'label'))?.[0]
    const description = deferred ? `Carte ${card ? `${card} ` : ''}(débit différé)` : label
    const base = [
      cell(row, 'booked'),
      cell(row, 'date'),
      amount,
      label,
      cell(row, 'operation'),
      cell(row, 'reference'),
    ].join('|')
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    transactions.push({
      id: `statement:${hash(`creditcoop|${base}|${occurrence}`)}`,
      date: deferred ? monthBefore(booked) : (parseDate(cell(row, 'date')) ?? booked),
      amount,
      currency: 'EUR',
      description,
      kind,
      mcc: null,
      pending: false,
      source: 'statement',
      bank: 'Crédit Coopératif',
      bankCategory: [cell(row, 'category'), cell(row, 'subcategory')].filter(Boolean).join(' > '),
    })
  }
  if (!transactions.length) throw new Error('No transactions found in this file')
  return transactions
}

function fromRows(rows: string[][]): Transaction[] {
  const creditCooperatif = rows.findIndex((row) => row.some((cell) => plain(cell) === CREDIT_COOPERATIF.label))
  if (creditCooperatif >= 0) return fromCreditCooperatif(rows, creditCooperatif)
  const headerIndex = rows.findIndex((row) => row.some((cell) => plain(cell) === 'description'))
  if (headerIndex < 0) {
    throw new Error(
      'This file does not look like a Revolut or Crédit Coopératif statement: it has no Description column',
    )
  }
  const header = rows[headerIndex].map(plain)
  const column = Object.fromEntries(
    Object.entries(COLUMNS).map(([name, aliases]) => [name, header.findIndex((cell) => aliases.includes(cell))]),
  ) as Record<keyof typeof COLUMNS, number>
  const missing = (['started', 'amount', 'currency'] as const).filter((name) => column[name] < 0)
  if (missing.length) {
    throw new Error(`This file does not look like a Revolut statement: it has no ${missing.join(', ')} column`)
  }
  const cell = (row: string[], name: keyof typeof COLUMNS) => (column[name] >= 0 ? (row[column[name]] ?? '') : '')
  const seen = new Map<string, number>()
  const transactions: Transaction[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const state = plain(cell(row, 'state')).toUpperCase()
    const date = parseDate(cell(row, 'started')) ?? parseDate(cell(row, 'completed'))
    const time = parseDate(cell(row, 'started')) ? parseTime(cell(row, 'started')) : parseTime(cell(row, 'completed'))
    if (!date || SKIPPED_STATES.includes(state)) continue
    const amount = Math.round((parseAmount(cell(row, 'amount')) - parseAmount(cell(row, 'fee'))) * 100) / 100
    const description = cell(row, 'description').trim() || 'Unknown'
    const currency = cell(row, 'currency').trim().toUpperCase()
    if (!amount || !/^[A-Z]{3}$/.test(currency)) continue
    const type = cell(row, 'type')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
    const product = plain(cell(row, 'product'))
    let kind: Kind = KINDS[type] ?? (amount < 0 ? 'card' : 'income')
    // Money coming back from savings, a vault or a pocket only moves between the owner's own accounts.
    if (kind === 'transfer' && amount > 0) {
      kind =
        (product && product !== 'current') || /savings|vault|pocket|coffre/i.test(description) ? 'transfer' : 'income'
    }
    // Identical rows (two coffees at the same minute) are told apart by their order in the file.
    const base = [cell(row, 'started'), amount, currency, description, product].join('|')
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    transactions.push({
      id: `statement:${hash(`${base}|${occurrence}`)}`,
      date,
      ...(time && { time }),
      amount,
      currency,
      description,
      kind,
      mcc: null,
      pending: state === 'PENDING' || state === 'EN_ATTENTE' || state === 'EN ATTENTE',
      source: 'statement',
    })
  }
  if (!transactions.length) throw new Error('No transactions found in this file')
  return transactions
}

/** A CSV file's text: UTF-8, or Windows-1252 as French banks export it ("N°", accents). */
async function readText(file: Blob) {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export async function readStatement(file: File) {
  const isWorkbook = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')
  return fromRows(isWorkbook ? await xlsxRows(file) : csvRows(await readText(file)))
}
