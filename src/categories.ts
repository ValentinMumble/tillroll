import type {CSSProperties} from 'react';
import type {BuiltInCategory, CategoryEdit, CategoryKey, Rules, Transaction} from './types';
import {plain} from './text';

export interface Category extends CategoryEdit {
  /** Added by hand: it can be deleted. */
  custom: boolean;
}

export const BUILT_IN: Category[] = [
  {key: 'groceries', label: 'Groceries', icon: '🛒', spending: true, custom: false},
  {key: 'eating-out', label: 'Eating out', icon: '🍽️', spending: true, custom: false},
  {key: 'transport', label: 'Transport', icon: '🚆', spending: true, custom: false},
  {key: 'shopping', label: 'Shopping', icon: '🛍️', spending: true, custom: false},
  {key: 'bills', label: 'Bills and subscriptions', icon: '🧾', spending: true, custom: false},
  {key: 'fun', label: 'Going out and fun', icon: '🎟️', spending: true, custom: false},
  {key: 'travel', label: 'Travel', icon: '✈️', spending: true, custom: false},
  {key: 'health', label: 'Health and sport', icon: '💊', spending: true, custom: false},
  {key: 'home', label: 'Home and rent', icon: '🏠', spending: true, custom: false},
  {key: 'cash', label: 'Cash', icon: '🏧', spending: true, custom: false},
  {key: 'other', label: 'Other', icon: '📦', spending: true, custom: false},
  // Money sent to people mostly pays for something (a share of a meal, a gift): it counts. Money from them is money in.
  {key: 'transfers', label: 'Transfers', icon: '↔️', spending: true, custom: false},
  {key: 'own', label: 'Between my accounts', icon: '🔁', spending: false, custom: false},
  {key: 'income', label: 'Money in', icon: '💶', spending: false, custom: false},
  {key: 'ignored', label: 'Ignored', icon: '🙈', spending: false, custom: false},
];

/**
 * Left out of every total, spending and money in or out alike: money moved between one's own accounts (savings,
 * pockets, top-ups, another bank), and payments ignored by hand.
 */
export const LEFT_OUT: CategoryKey[] = ['own', 'ignored'];

/** The icon a new category gets when none is picked. */
export const DEFAULT_ICON = '🏷️';

/**
 * What an icon field keeps when it changes: the emoji just typed or picked, so it replaces the old one instead of
 * joining it, wherever the cursor was. An emoji made of several characters (a flag, 👨‍👩‍👧) counts as one.
 */
export function oneIcon(next: string, previous: string) {
  const emoji = [...new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(next.trim())].map(
    part => part.segment,
  );
  if (emoji.length <= 1) return emoji[0] ?? '';
  return emoji.find(item => item !== previous) ?? emoji[emoji.length - 1];
}

/** The style that hands a category's colour to its dot, bar or pill, as --cat. */
export const colourStyle = (colour: string | undefined) => ({'--cat': colour ?? 'var(--cat-grey)'}) as CSSProperties;

/** The categories in use: the built-in ones as changed by hand, and the new ones (before Other). */
export interface Categories {
  list: Category[];
  /** The same, by name, for the dropdowns. */
  alphabetical: Category[];
  byKey: Record<CategoryKey, Category>;
  /** Each one's colour, a CSS value (see colourOf). */
  colours: Record<CategoryKey, string>;
}

/**
 * The built-in spending categories' slots in the categorical palette (--cat-1 to --cat-8 in index.css, stepped for
 * light and dark). Travel shares Going out and fun's violet: eight hues, nine categories, the two closest share.
 */
const SLOTS: Record<CategoryKey, number> = {
  home: 1,
  groceries: 2,
  'eating-out': 3,
  transport: 4,
  shopping: 5,
  bills: 6,
  fun: 7,
  travel: 7,
  health: 8,
};

/** The slots the categories added by hand take, in turn: the ones the eye mixes up least with the built-in ones first. */
const ADDED_SLOTS = [5, 7, 3, 4, 6, 2, 8, 1];

/**
 * A category's colour: its own slot for a built-in spending one, the next in turn for one added by hand (by its
 * place among those, so it keeps it whatever it costs), and grey for Cash, Other and what is not spending. A
 * colour always comes with the category's name, so two sharing one are never told apart by it alone.
 */
function colourOf(category: Category, added: Category[]) {
  if (!category.spending) return 'var(--cat-grey)';
  if (category.custom) return `var(--cat-${ADDED_SLOTS[added.indexOf(category) % ADDED_SLOTS.length]})`;
  return SLOTS[category.key] ? `var(--cat-${SLOTS[category.key]})` : 'var(--cat-grey)';
}

export function categoriesFrom(edits: CategoryEdit[]): Categories {
  const edited = new Map(edits.map(edit => [edit.key, edit]));
  const builtIn = BUILT_IN.map(category => ({...category, ...edited.get(category.key), custom: false}));
  const added = edits
    .filter(edit => !BUILT_IN.some(category => category.key === edit.key))
    .map(edit => ({...edit, custom: true}));
  const other = builtIn.findIndex(category => category.key === 'other');
  const list = [...builtIn.slice(0, other), ...added, ...builtIn.slice(other)];
  return {
    list,
    alphabetical: [...list].sort((first, second) =>
      first.label.localeCompare(second.label, 'en', {sensitivity: 'base'}),
    ),
    byKey: Object.fromEntries(list.map(category => [category.key, category])),
    colours: Object.fromEntries(list.map(category => [category.key, colourOf(category, added)])),
  };
}

/** What to save: the new categories and the built-in ones that differ from their defaults. */
export function editsFrom(list: Category[]): CategoryEdit[] {
  return list
    .filter(category => {
      const original = BUILT_IN.find(item => item.key === category.key);
      return (
        !original ||
        original.label !== category.label ||
        original.icon !== category.icon ||
        original.spending !== category.spending
      );
    })
    .map(({key, label, icon, spending}) => ({key, label, icon, spending}));
}

export function newCategoryKey(label: string) {
  const slug = plain(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return `custom-${slug || 'category'}-${Date.now().toString(36)}`;
}

/** Store names that give the category away. Checked in this order: "Uber Eats" is eating out, not transport. */
const KEYWORDS: [BuiltInCategory, RegExp][] = [
  [
    'eating-out',
    /uber\s*\*?\s*eats|deliveroo|just ?eat|foodora|wolt|restaurant|resto\b|brasserie|bistro|cafe|café|coffee|starbucks|mcdonald|burger|kfc|pizza|sushi|kebab|\bbar\b|\bpub\b|cantine|crêperie|creperie|traiteur|trattoria|osteria|taberna|tapas|gelat|\brest\b|restau|ristorante|restaurang|locanda|cantina|taverna|tavern|ramen|izakaya|\bpoke\b|thai|curry|tandoori|grill|diner|bagel|cr[eê]pe|kaf[eé]|kaffe|konditori|glacier|mcdo|sunday\s*\*|brewery|bi[eè]re|\bbeer|taproom|cocktail/i,
  ],
  [
    'groceries',
    /carrefour|lidl|aldi|monoprix|franprix|auchan|leclerc|intermarch|super ?u\b|hyper ?u\b|casino|picard|biocoop|naturalia|grand frais|\bg20\b|\bica\b|\bcoop\b|willys|hemköp|tesco|sainsbury|waitrose|\bspar\b|rewe|edeka|albert heijn|mercadona|boulangerie|bakery|primeur|[eé]picerie|supermarch|fromagerie|boucherie|p[aâ]tisserie|chocolat|march[eé]\b|\bmarket|halles|netto|leader price|\bcora\b|la vie claire|bio c|vival|proxi\b|u express/i,
  ],
  [
    'transport',
    /\buber\b|\bbolt\b|heetch|free ?now|\bg7\b|taxi|sncf|ratp|navigo|\btan\b|\btcl\b|\bsl\b|\bsj\b|trainline|blablacar|ouigo|\blime\b|\btier\b|dott|velib|vélib|parking|indigo|autoroute|péage|peage|totalenergies|\besso\b|\bshell\b|\bbp\b|circle k|eurail|interrail|flixbus|altibus|ferr(y|ies)|oc[eé]ane|penn ar bed|trenitalia|renfe|[oö]bb\b|deutsche bahn|\bsbb\b|bibus|korrigo/i,
  ],
  [
    'travel',
    /airbnb|booking\.com|hotel|hôtel|hostel|expedia|ryanair|easyjet|air ?france|\bklm\b|transavia|vueling|lufthansa|\bsas\b|norwegian|eurostar|getyourguide/i,
  ],
  [
    'bills',
    /netflix|spotify|deezer|disney|canal\+|apple|google|youtube|icloud|amazon prime|prime video|free mobile|\bfree\b|orange|\bsfr\b|bouygues|sosh|\bedf\b|engie|total ?energies? ?(electricit|gaz)|veolia|assurance|insurance|alan\b|mutuelle|openai|anthropic|github|vercel|notion|revolut|impots|impôts|strava|komoot|patreon|dropbox|proton|1password|syndic|cotisation/i,
  ],
  [
    'home',
    /\brent\b|loyer|hyra|ikea|leroy merlin|castorama|bricorama|brico|maisons du monde|conforama|darty|boulanger\b|\bbut\b|habitat/i,
  ],
  [
    'health',
    /pharmac|apotek|docteur|\bdr\b|m[ée]decin|dentist|doctolib|optic|opticien|basic.?fit|fitness|\bgym\b|neoness|on air|coiffeur|hair|barber|sephora|nocib|osteo|phcie|clinique|h[oô]pital|kin[eé]|podolog|laborato|piscine|escalade|climbing|yoga|crossfit/i,
  ],
  [
    'fun',
    /cin[ée]ma|\bugc\b|path[ée]|gaumont|\bmk2\b|steam|playstation|nintendo|xbox|ticketmaster|fnac spectacles|dice\.fm|museum|museo|mus[ée]e|concert|bowling|th[ée][aâ]tre|theatre|ticket|billet|weezevent|shotgun|fever|festival|bandcamp|spectacle|\bzoo\b|aquarium|karting|escape game/i,
  ],
  [
    'shopping',
    /amazon|amzn|fnac|decathlon|zara|h&m|uniqlo|zalando|vinted|ebay|primark|action\b|kiabi|galeries lafayette|printemps|cultura|apple store|\bshop|store\b|boutique|librairie|\bbooks?\b|bookshop|cycling|socks|apparel|outdoor|intersport|go sport|brick|print/i,
  ],
];

/** Merchant category codes (ISO 18245), first matching range wins: the broad retail range comes last. */
const MCC_RANGES: [number, number, BuiltInCategory][] = [
  [3000, 3350, 'travel'],
  [3351, 3500, 'transport'],
  [3501, 3999, 'travel'],
  [4011, 4131, 'transport'],
  [4411, 4582, 'travel'],
  [4722, 4723, 'travel'],
  [4784, 4789, 'transport'],
  [4812, 4816, 'bills'],
  [4829, 4829, 'transfers'],
  [4899, 4900, 'bills'],
  [5200, 5261, 'home'],
  [5411, 5411, 'groceries'],
  [5422, 5499, 'groceries'],
  [5541, 5542, 'transport'],
  [5712, 5722, 'home'],
  [5733, 5735, 'fun'],
  [5811, 5814, 'eating-out'],
  [5815, 5818, 'bills'],
  [5912, 5912, 'health'],
  [5975, 5977, 'health'],
  [6010, 6011, 'cash'],
  [6012, 6012, 'transfers'],
  [6051, 6051, 'transfers'],
  [6300, 6399, 'bills'],
  [6540, 6540, 'transfers'],
  [7011, 7012, 'travel'],
  [7230, 7230, 'health'],
  [7298, 7298, 'health'],
  [7512, 7523, 'transport'],
  [7832, 7841, 'fun'],
  [7997, 7997, 'health'],
  [7911, 7999, 'fun'],
  [8011, 8099, 'health'],
  [5000, 5999, 'shopping'],
];

/**
 * What a category comes from, from sure to unsure: picked by hand, the kind of movement, a keyword in the store
 * name, the merchant code, the broad retail range of merchant codes, a transfer to someone, nothing at all.
 */
export type Basis = 'picked' | 'kind' | 'keyword' | 'code' | 'broad-code' | 'transfer' | 'none';

/** The guesses worth a look by hand (see the sorting deck). */
export const UNSURE: Basis[] = ['none', 'broad-code', 'transfer'];

/** A Revolut account or pocket in another currency, or the same one: "To EUR Sous", "From SEK". */
const CURRENCY_ACCOUNT = /^(to|from) (EUR|USD|GBP|SEK|NOK|DKK|CHF|PLN|CZK|HUF|RON|JPY|CAD|AUD)\b/i;

/** Health costs paid back by the state or a mutual insurer: refunds of health spending. */
const HEALTH_REFUND = /\bcpam\b|\bameli\b|mutuelle|gerep|groupe europeen retrai|harmonie mutuelle|\bmgen\b/i;

/** Savings, pockets, a top-up from one's own card: money that stays one's own. */
const OWN_TEXT =
  /\b(pockets?|vault|savings?|coffre|flexible (cash funds|account)|instant access|livret|ldds?|lep)\b|[ée]pargne|^top-?up by\b/i;

const wordsOf = (text: string) => plain(text).match(/[a-z]+/g) ?? [];

/** Words around a name in a bank text: "Virement vers M ...", "Payment from ...". */
const FILLERS = new Set([
  'virement',
  'vir',
  'vers',
  'de',
  'du',
  'from',
  'to',
  'payment',
  'transfer',
  'sepa',
  'instantane',
  'm',
  'mr',
  'mme',
  'monsieur',
  'madame',
]);

/**
 * The bank text names the account holder: every word of one of their names, in any order, maybe cut short by the
 * bank ("Payment from DIJKSTRA VALENTI", "M DIJKSTRA VALENTIN"). A name needs two words, so "Main" never matches.
 * One more word is fine (a middle name, "Revolut"); two are someone else's name too, as on a joint account.
 */
function namesMe(text: string, me: string[]) {
  const said = wordsOf(text);
  return me.some(name => {
    const parts = wordsOf(name).filter(part => part.length >= 3);
    if (parts.length < 2) return false;
    const found = parts.map(part => said.find(word => word === part || (word.length >= 5 && part.startsWith(word))));
    if (found.some(word => !word)) return false;
    return said.filter(word => !found.includes(word) && !FILLERS.has(word)).length <= 1;
  });
}

/**
 * The bank's own categories (Crédit Coopératif's statement), a clue when the store name gives none: the most precise
 * one first. A broad one leaves the store to sort. Written in plain words, as `wordsOf` gives them.
 */
const BANK_CATEGORIES: Record<string, {category: BuiltInCategory; basis: Basis}> = {
  'virement interne': {category: 'own', basis: 'kind'},
  'internet et telephonie': {category: 'bills', basis: 'code'},
  'frais bancaires': {category: 'bills', basis: 'code'},
  'remboursements de soins': {category: 'health', basis: 'code'},
  'transports en commun': {category: 'transport', basis: 'code'},
  'livres magazines': {category: 'fun', basis: 'code'},
  'video musique et jeux': {category: 'fun', basis: 'code'},
  salaires: {category: 'income', basis: 'kind'},
  alimentation: {category: 'groceries', basis: 'code'},
  sante: {category: 'health', basis: 'code'},
  transports: {category: 'transport', basis: 'code'},
  'shopping et services': {category: 'shopping', basis: 'broad-code'},
  'loisirs et vacances': {category: 'fun', basis: 'broad-code'},
  'logement maison': {category: 'home', basis: 'broad-code'},
  'banque et assurances': {category: 'bills', basis: 'broad-code'},
};

function bankHint({bankCategory}: Transaction) {
  const names = bankCategory?.split(' > ').reverse() ?? [];
  return names.map(name => BANK_CATEGORIES[wordsOf(name).join(' ')]).find(Boolean);
}

/**
 * The category Tillroll guesses, from the kind of movement, the store name and the merchant code. `me` holds the
 * account holder's names (the bank accounts' names), for the transfers to and from oneself.
 */
function guessWithBasis(transaction: Transaction, me: string[] = []): {category: BuiltInCategory; basis: Basis} {
  const {description, mcc} = transaction;
  // Some banks give a transfer out no account on the other side, so it reads as a card payment: "VIR SEPA ...".
  const kind = transaction.kind === 'card' && /^vir(ement)?\b/i.test(description) ? 'transfer' : transaction.kind;
  if (kind === 'topup' || kind === 'exchange') return {category: 'own', basis: 'kind'};
  // Interest paid on savings is money in, even when the savings name it.
  const own =
    (OWN_TEXT.test(description) && !/\binterest\b|int[ée]r[êe]ts/i.test(description)) ||
    CURRENCY_ACCOUNT.test(description) ||
    namesMe(description, me);
  if (kind !== 'card' && kind !== 'refund' && own) return {category: 'own', basis: 'kind'};
  const hint = bankHint(transaction);
  if (hint?.category === 'own') return hint;
  if (transaction.amount > 0 && HEALTH_REFUND.test(description)) return {category: 'health', basis: 'keyword'};
  if (kind === 'income') return {category: 'income', basis: 'kind'};
  if (kind === 'atm') return {category: 'cash', basis: 'kind'};
  const keyword = KEYWORDS.find(([, pattern]) => pattern.test(description));
  // A store's word in a transfer may be a person's name (Leclerc): worth a look.
  if (keyword) return {category: keyword[0], basis: kind === 'transfer' ? 'transfer' : 'keyword'};
  if (hint) return hint;
  // A transfer to someone may be rent, a gift or a shared bill.
  if (kind === 'transfer') return {category: 'transfers', basis: 'transfer'};
  if (kind === 'fee') return {category: 'bills', basis: 'kind'};
  const code = Number(mcc);
  const range = mcc ? MCC_RANGES.find(([from, to]) => code >= from && code <= to) : undefined;
  if (!range) return {category: 'other', basis: 'none'};
  return {category: range[2], basis: range === MCC_RANGES.at(-1) ? 'broad-code' : 'code'};
}

export function guessCategory(transaction: Transaction, me: string[] = []) {
  return guessWithBasis(transaction, me).category;
}

/** The category picked by hand for the store, if it still exists, or the guess; and what it comes from. */
export function categoryOf(
  transaction: Transaction,
  key: string,
  rules: Rules,
  categories: Categories,
  me: string[] = [],
): {category: CategoryKey; basis: Basis} {
  const picked = rules[key];
  if (!picked || !categories.byKey[picked]) return guessWithBasis(transaction, me);
  // Money in that is no refund (a salary, a sale) stays money in, from a store filed under spending too.
  if (categories.byKey[picked].spending && transaction.amount > 0 && transaction.kind === 'income') {
    return guessWithBasis(transaction, me);
  }
  // Transfers picked by hand are to other people: one between one's own accounts (a pocket, oneself) stays apart.
  if (picked === 'transfers' && guessWithBasis(transaction, me).category === 'own') {
    return {category: 'own', basis: 'picked'};
  }
  return {category: picked, basis: 'picked'};
}
