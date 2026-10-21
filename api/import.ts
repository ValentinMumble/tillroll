import type {Kind, Transaction} from '../src/types';
import {handle, HttpError, json, readJson} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';
import {saveTransactions} from './_lib/store.js';

const KINDS: Kind[] = ['card', 'refund', 'transfer', 'topup', 'exchange', 'atm', 'fee', 'income'];

function isTransaction(value: unknown): value is Transaction {
  const item = value as Transaction;
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    item.id.startsWith('statement:') &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    Number.isFinite(item.amount) &&
    /^[A-Z]{3}$/.test(item.currency) &&
    typeof item.description === 'string' &&
    item.description.length <= 300 &&
    KINDS.includes(item.kind)
  );
}

/**
 * POST /api/import { transactions }: the owner's statement rows, read in the page (see src/statement.ts). They
 * fill the history before the bank sync starts: the page hides those that overlap the bank's.
 */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request);
    const {transactions} = await readJson(request);
    if (!Array.isArray(transactions) || transactions.length > 20_000 || !transactions.every(isTransaction)) {
      throw new HttpError(400, 'Expected statement transactions');
    }
    const text = (value: unknown, length: number) =>
      typeof value === 'string' && value.length > 0 && value.length <= length ? value : undefined;
    await saveTransactions(
      transactions.map(item => ({
        ...item,
        time: typeof item.time === 'string' && /^\d{2}:\d{2}$/.test(item.time) ? item.time : undefined,
        bank: text(item.bank, 60),
        bankCategory: text(item.bankCategory, 120),
        bookedOn:
          typeof item.bookedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.bookedOn) ? item.bookedOn : undefined,
        mcc: null,
        pending: Boolean(item.pending),
        source: 'statement',
      })),
    );
    return json({saved: transactions.length});
  });
}
