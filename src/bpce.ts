import type {SavingsStatement, StatementKind, StatementMovement, StatementValue} from './types';

/** The savings account a BPCE Vie statement belongs to (see src/savings.ts). */
export const BPCE_ACCOUNT = 'assurance-vie';

/** A run of text on a PDF page: its page, how far it sits from the page's top and left (in points), its words. */
export interface PdfLine {
  page: number;
  top: number;
  left: number;
  text: string;
}

/** An amount as the statements write it: "10 000,00", "-0,00149" (the thousands apart with any kind of space). */
const NUMBER = /^-?\d{1,3}(?:[\s  ]\d{3})*,\d+$/;
const DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
const ISIN = /^[A-Z]{2}\d/;

/** A movement's kind, from the start of its label. */
const KINDS: [string, StatementKind][] = [
  ['Versement', 'payment'],
  ["Frais de l'opération", 'entry-fee'],
  ['Frais de gestion', 'management-fee'],
  ["Intérêts de l'année", 'interest'],
  ['Intérêts supplémentaires', 'extra-interest'],
  ['Prélèvements sociaux', 'social-charges'],
  ['Distribution', 'distribution'],
  ['Arbitrage', 'switch'],
  ['Rachat', 'withdrawal'],
];
/** The words a movement's label starts with: it may wrap after the first ("Intérêts" / "supplémentaires"). */
const FIRST_WORDS = new Set(['Versement', 'Frais', 'Intérêts', 'Prélèvements', 'Distribution', 'Arbitrage', 'Rachat']);
/** Each page's header and footer, never part of a label that runs over a page break. */
const PAGE_FURNITURE = ['Votre contrat', "Numéro d'adhésion", 'RELEVE DE SITUATION', 'BPCE Vie', 'Siège social'];
const TABLE_HEADINGS = ['Supports', 'Quantité', 'Montant en Euros', 'Code ISIN / Code', 'support'];

/*
 * Where each column starts, in points from the page's left. Movements: the label at 31 (its funds indented further),
 * the fund's code at 115, the movement's amount around 245 to 270 ("Global"), the fund's share around 310 to 330
 * ("Détail"), the fund's unit value at 378. The fund tables: the name, the code from 260, the quantity from 375, the
 * amount from 450.
 */
const LABEL_LEFT = 33;
const isGlobal = (left: number) => left >= 240 && left <= 275;
const isDetail = (left: number) => left >= 300 && left <= 335;
const isCode = (left: number) => left >= 110 && left < 125;
const isUnitValue = (left: number) => left >= 370 && left <= 395;
/** Rows of one table line can sit a point or two apart (a long fund name, a bolder figure). */
const SAME_ROW = 3;

const amountOf = (text: string) => Number(text.replace(/[\s  ]/g, '').replace(',', '.'));

function dayOf(text: string) {
  const match = DATE.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** A cell of a movement's fund rows, put in (under "Investissement") or taken out of a fund. */
interface Cell extends PdfLine {
  side: 'in' | 'out';
}

interface Reading {
  label: string;
  date: string | null;
  amount: number | null;
  cells: Cell[];
}

interface FundRow {
  page: number;
  top: number;
  name?: string;
  isin?: string | null;
  quantity?: number | null;
  amount?: number;
}

/** True for a BPCE Vie "Relevé de situation détaillé". */
export function isBpceStatement(lines: PdfLine[]) {
  return (
    lines.some(line => line.text.startsWith('RELEVE DE SITUATION')) &&
    lines.some(line => line.text.startsWith('BPCE Vie'))
  );
}

/**
 * A BPCE Vie statement's contents, from its text runs: every movement (payments, fees, interest, social charges,
 * dividends, switches between funds, each with how it was split between the funds) and the value at the statement's
 * start and end, fund by fund. The contract's name only, not its number. Null for any other PDF.
 */
export function readBpceStatement(lines: PdfLine[]): SavingsStatement | null {
  if (!isBpceStatement(lines)) return null;
  const sorted = [...lines].sort(
    (first, second) =>
      first.page - second.page ||
      first.top - second.top ||
      first.left - second.left ||
      (first.text < second.text ? -1 : first.text > second.text ? 1 : 0),
  );
  let contract = '';
  const readings: Reading[] = [];
  const tables: StatementValue[] = [];
  let current: Reading | null = null;
  let side: 'in' | 'out' | null = null;
  let table: StatementValue | null = null;
  let rows: FundRow[] = [];
  const near = <Item extends {page: number; top: number}>(items: Item[], page: number, top: number) =>
    items.find(item => item.page === page && Math.abs(item.top - top) <= SAME_ROW);

  for (const {page, top, left, text} of sorted) {
    if (text.startsWith('Votre contrat')) contract = text.split(':').slice(1).join(':').trim();
    if (PAGE_FURNITURE.some(start => text.startsWith(start)) || /^\d+\/\d+$/.test(text)) continue;

    // A fund table: its heading gives the day and the value, then a row per fund.
    if (text.startsWith('Montant de votre épargne au')) {
      const date = dayOf(text);
      if (!date) continue;
      const same = tables.find(item => item.date === date);
      // A table that runs over two pages repeats its heading: the rows carry on.
      if (!same || same !== table) {
        table = same ?? {
          date,
          value: amountOf(text.split(':').slice(1).join(':').replace('EUR', '').trim()),
          funds: [],
        };
        if (!same) tables.push(table);
        rows = [];
      }
      continue;
    }
    if (table) {
      // It ends with the euro fund's fee rate or, for the table at a statement's start, where the movements begin.
      if (text.startsWith('Taux de frais') || text.startsWith('Nature du') || text.startsWith('Situation du')) {
        for (const row of [...rows].sort((first, second) => first.page - second.page || first.top - second.top)) {
          if (row.name && row.amount !== undefined) {
            table.funds.push({
              name: row.name,
              isin: row.isin ?? null,
              quantity: row.quantity ?? null,
              amount: row.amount,
            });
          }
        }
        table = null;
        continue;
      }
      if (TABLE_HEADINGS.includes(text) || text.includes('Aucun support')) continue;
      if (left >= 250 && text !== '-' && !NUMBER.test(text) && !ISIN.test(text)) continue;
      let row = near(rows, page, top);
      if (!row) {
        row = {page, top};
        rows.push(row);
      }
      if (left < 250) row.name = text;
      else if (left < 300) row.isin = text === '-' ? null : text;
      else if (left < 420) row.quantity = text === '-' ? null : amountOf(text);
      else row.amount = amountOf(text);
      continue;
    }

    // The movements: a label in the first column, its amount in "Global", then the funds it went to or came from.
    if (left <= LABEL_LEFT) {
      if (FIRST_WORDS.has(text.split(/\s+/)[0]) && !text.startsWith('Investissement')) {
        current = {label: text, date: null, amount: null, cells: []};
        readings.push(current);
        side = null;
        continue;
      }
      if (text === 'Investissement' || text === 'Désinvestissement') {
        side = text === 'Investissement' ? 'in' : 'out';
        continue;
      }
      if (current && (current.amount === null || !current.date)) current.label += ` ${text}`;
    }
    if (!current) continue;
    if (!current.date && DATE.test(text) && left <= 80) current.date = dayOf(text);
    if (isGlobal(left) && NUMBER.test(text) && current.amount === null) current.amount = amountOf(text);
    else if (side) current.cells.push({page, top, left, text, side});
  }

  const movements: StatementMovement[] = [];
  readings.forEach((reading, index) => {
    const label = reading.label.replace(/\s+/g, ' ').trim();
    const kind = KINDS.find(([start]) => label.startsWith(start))?.[1];
    // An entry fee has no day of its own: it is the payment's just before it.
    const date = reading.date ?? movements.at(-1)?.date ?? readings[index - 1]?.date ?? null;
    if (!kind || !date || reading.amount === null) return;
    movements.push({kind, label, date, amount: reading.amount, details: detailsOf(reading.cells)});
  });
  movements.sort((first, second) => (first.date < second.date ? -1 : first.date > second.date ? 1 : 0));
  tables.sort((first, second) => (first.date < second.date ? -1 : 1));
  return {contract, movements, values: tables};
}

/**
 * How a movement was split between the funds: one row each, with its share ("Détail"), the fund's code or the euro
 * fund, and the fund's unit value. The cells of a row can come in any order, so the rows are put together first.
 */
function detailsOf(cells: Cell[]): StatementMovement['details'] {
  const rows: Cell[][] = [];
  for (const cell of cells) {
    const row = rows.find(cells => cells[0].page === cell.page && Math.abs(cells[0].top - cell.top) <= SAME_ROW);
    if (row) row.push(cell);
    else rows.push([cell]);
  }
  return rows.flatMap(row => {
    const share = row.find(cell => isDetail(cell.left) && NUMBER.test(cell.text));
    if (!share) return [];
    const code = row.find(cell => isCode(cell.left) && ISIN.test(cell.text));
    const unit = row.find(cell => isUnitValue(cell.left) && NUMBER.test(cell.text));
    const euros = row.some(cell => cell.text === 'Fonds en euros');
    return [
      {
        side: share.side,
        amount: amountOf(share.text),
        ...(code ? {isin: code.text} : euros ? {isin: null, fund: 'Fonds en euros'} : {}),
        ...(unit && {unitValue: amountOf(unit.text)}),
      },
    ];
  });
}

/** A movement's identity across statements: the same day, kind and amount (the insurer's words may change). */
const movementKey = (movement: StatementMovement) => [movement.date, movement.kind, movement.amount].join('|');

/**
 * A statement added to the ones kept: its movements replace the same ones already there (a statement imported twice
 * stays once), and a value of the same day replaces the one kept (a statement's start repeats the one before's end).
 */
export function mergeStatements(kept: SavingsStatement | undefined, read: SavingsStatement): SavingsStatement {
  if (!kept) return read;
  const readKeys = new Set(read.movements.map(movementKey));
  const movements = [...kept.movements.filter(movement => !readKeys.has(movementKey(movement))), ...read.movements];
  movements.sort((first, second) => (first.date < second.date ? -1 : first.date > second.date ? 1 : 0));
  const values = new Map(kept.values.map(item => [item.date, item]));
  for (const item of read.values) values.set(item.date, item);
  return {
    contract: read.contract || kept.contract,
    movements,
    values: [...values.values()].sort((first, second) => (first.date < second.date ? -1 : 1)),
  };
}
