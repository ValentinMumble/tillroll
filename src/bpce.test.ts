import {describe, expect, it} from 'vitest';
import {mergeStatements, type PdfLine, readBpceStatement} from './bpce';

/** A made-up BPCE Vie statement for 2025, laid out as the real ones are: what pdf.js reads of it. */
const page = (number: number, rows: [number, number, string][]): PdfLine[] => [
  {page: number, top: 56, left: 121, text: 'RELEVE DE SITUATION DETAILLE DU 31/12/2024 AU 31/12/2025'},
  {page: number, top: 88, left: 28, text: 'Votre contrat : MILLEVIE Essentielle 2'},
  {page: number, top: 98, left: 28, text: "Numéro d'adhésion : TEST0000001"},
  ...rows.map(([top, left, text]) => ({page: number, top, left, text})),
  {page: number, top: 770, left: 28, text: 'BPCE Vie, Société anonyme au capital social de 161 469 776 euros'},
  {page: number, top: 804, left: 532, text: `${number}/2`},
];

const statement2025: PdfLine[] = [
  ...page(1, [
    [170, 31, 'Montant de votre épargne au 31/12/2024 : 1 000,00 EUR'],
    [196, 103, 'Fonds en euros'],
    [196, 296, '-'],
    [196, 395, '-'],
    [196, 471, '1 000,00'],
    [271, 49, 'Nature du'],
    // A monthly payment, split between the euro fund and one fund.
    [324, 31, 'Versement'],
    [329, 251, '250,00'],
    [334, 31, 'programmé du'],
    [344, 31, '05/01/2025'],
    [360, 31, 'Investissement'],
    [375, 318, '200,00'],
    [376, 47, 'Fonds en euros'],
    [376, 181, '05/01/2025'],
    [391, 52, 'ALLOCATION'],
    [401, 115, 'FR0012333219'],
    [401, 181, '05/01/2025'],
    [401, 322, '50,00'],
    [401, 378, '160,00000'],
    [401, 440, '0,31250'],
    [411, 71, 'PILOTEE'],
    [430, 31, "Frais de l'opération"],
    [430, 256, '5,00'],
  ]),
  ...page(2, [
    // A label that wraps after its first word.
    [212, 31, 'Intérêts'],
    [222, 31, 'supplémentaires nets'],
    [232, 254, '31,00'],
    [242, 31, 'du 02/01/2025'],
    [258, 31, 'Investissement'],
    [273, 47, 'Fonds en euros'],
    [273, 181, '02/01/2025'],
    [273, 325, '31,00'],
    [428, 31, 'Montant de votre épargne au 31/12/2025 : 1 300,00 EUR'],
    [470, 103, 'Fonds en euros'],
    [470, 296, '-'],
    [470, 395, '-'],
    [470, 469, '1 251,00'],
    [487, 57, 'ALLOCATION PILOTEE OFFENSIVE'],
    [486, 266, 'FR0012333219'],
    [486, 381, '0,31250'],
    [486, 475, '49,00'],
    [520, 31, 'Taux de frais de gestion du fonds en euros : 0,700%'],
  ]),
];

describe('a BPCE Vie statement', () => {
  const read = readBpceStatement(statement2025)!;

  it('reads every line with its day and amount, and how it was split between the funds', () => {
    expect(read.contract).toBe('MILLEVIE Essentielle 2');
    expect(read.movements.map(item => [item.kind, item.date, item.amount])).toEqual([
      ['extra-interest', '2025-01-02', 31],
      ['payment', '2025-01-05', 250],
      ['entry-fee', '2025-01-05', 5],
    ]);
    expect(read.movements[1].details).toEqual([
      {side: 'in', amount: 200, isin: null, fund: 'Fonds en euros'},
      {side: 'in', amount: 50, isin: 'FR0012333219', unitValue: 160},
    ]);
  });

  it('reads the value at its start and end, fund by fund, and leaves the contract number out', () => {
    expect(read.values.map(item => [item.date, item.value, item.funds.map(fund => [fund.name, fund.amount])])).toEqual([
      ['2024-12-31', 1000, [['Fonds en euros', 1000]]],
      [
        '2025-12-31',
        1300,
        [
          ['Fonds en euros', 1251],
          ['ALLOCATION PILOTEE OFFENSIVE', 49],
        ],
      ],
    ]);
    expect(JSON.stringify(read)).not.toContain('TEST0000001');
  });

  it('adds to the statements kept, once even when imported twice', () => {
    const older = {
      contract: 'MILLEVIE Essentielle 2',
      movements: [
        {
          kind: 'payment' as const,
          label: 'Versement programmé du 05/12/2024',
          date: '2024-12-05',
          amount: 250,
          details: [],
        },
      ],
      values: [{date: '2024-12-31', value: 1000, funds: []}],
    };
    const kept = mergeStatements(mergeStatements(older, read), read);
    expect(kept.movements.map(item => item.date)).toEqual(['2024-12-05', '2025-01-02', '2025-01-05', '2025-01-05']);
    expect(kept.values.map(item => item.date)).toEqual(['2024-12-31', '2025-12-31']);
  });

  it('reads nothing from another PDF', () => {
    expect(readBpceStatement([{page: 1, top: 50, left: 30, text: 'Facture n° 42'}])).toBeNull();
  });
});
