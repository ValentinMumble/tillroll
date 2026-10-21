/** Banks known by their initial and colour; any other shows its first letter. */
export const BANKS: Record<string, {letter: string; tone: string}> = {
  Revolut: {letter: 'R', tone: 'revolut'},
  'Crédit Coopératif': {letter: 'C', tone: 'credit-cooperatif'},
  PayPal: {letter: 'P', tone: 'paypal'},
  'La Nef': {letter: 'N', tone: 'la-nef'},
};

/** The banks with a letter of their own. */
export const BANK_NAMES = Object.keys(BANKS);
