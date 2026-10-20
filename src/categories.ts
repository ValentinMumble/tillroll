import type { BuiltInCategory, CategoryEdit, CategoryKey, Rules, Transaction } from './types'

export interface Category extends CategoryEdit {
  /** Added by hand: it can be deleted. */
  custom: boolean
}

export const BUILT_IN: Category[] = [
  { key: 'groceries', label: 'Groceries', icon: '🛒', spending: true, custom: false },
  { key: 'eating-out', label: 'Eating out', icon: '🍽️', spending: true, custom: false },
  { key: 'transport', label: 'Transport', icon: '🚆', spending: true, custom: false },
  { key: 'shopping', label: 'Shopping', icon: '🛍️', spending: true, custom: false },
  { key: 'bills', label: 'Bills and subscriptions', icon: '🧾', spending: true, custom: false },
  { key: 'fun', label: 'Going out and fun', icon: '🎟️', spending: true, custom: false },
  { key: 'travel', label: 'Travel', icon: '✈️', spending: true, custom: false },
  { key: 'health', label: 'Health and sport', icon: '💊', spending: true, custom: false },
  { key: 'home', label: 'Home and rent', icon: '🏠', spending: true, custom: false },
  { key: 'cash', label: 'Cash', icon: '🏧', spending: true, custom: false },
  { key: 'other', label: 'Other', icon: '📦', spending: true, custom: false },
  { key: 'transfers', label: 'Transfers and savings', icon: '↔️', spending: false, custom: false },
  { key: 'income', label: 'Money in', icon: '💶', spending: false, custom: false },
]

/** The categories in use: the built-in ones as changed by hand, and the new ones (before Other). */
export interface Categories {
  list: Category[]
  byKey: Record<CategoryKey, Category>
}

export function categoriesFrom(edits: CategoryEdit[]): Categories {
  const edited = new Map(edits.map((edit) => [edit.key, edit]))
  const builtIn = BUILT_IN.map((category) => ({ ...category, ...edited.get(category.key), custom: false }))
  const added = edits
    .filter((edit) => !BUILT_IN.some((category) => category.key === edit.key))
    .map((edit) => ({ ...edit, custom: true }))
  const other = builtIn.findIndex((category) => category.key === 'other')
  const list = [...builtIn.slice(0, other), ...added, ...builtIn.slice(other)]
  return { list, byKey: Object.fromEntries(list.map((category) => [category.key, category])) }
}

/** What to save: the new categories and the built-in ones that differ from their defaults. */
export function editsFrom(list: Category[]): CategoryEdit[] {
  return list
    .filter((category) => {
      const original = BUILT_IN.find((item) => item.key === category.key)
      return (
        !original ||
        original.label !== category.label ||
        original.icon !== category.icon ||
        original.spending !== category.spending
      )
    })
    .map(({ key, label, icon, spending }) => ({ key, label, icon, spending }))
}

export function newCategoryKey(label: string) {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
  return `custom-${slug || 'category'}-${Date.now().toString(36)}`
}

/** Store names that give the category away. Checked in this order: "Uber Eats" is eating out, not transport. */
const KEYWORDS: [BuiltInCategory, RegExp][] = [
  [
    'eating-out',
    /uber\s*\*?\s*eats|deliveroo|just ?eat|foodora|wolt|restaurant|resto\b|brasserie|bistro|cafe|café|coffee|starbucks|mcdonald|burger|kfc|pizza|sushi|kebab|\bbar\b|\bpub\b|cantine|crêperie|creperie|traiteur|trattoria|osteria|taberna|tapas|gelat/i,
  ],
  [
    'groceries',
    /carrefour|lidl|aldi|monoprix|franprix|auchan|leclerc|intermarch|super ?u\b|hyper ?u\b|casino|picard|biocoop|naturalia|grand frais|\bg20\b|\bica\b|\bcoop\b|willys|hemköp|tesco|sainsbury|waitrose|\bspar\b|rewe|edeka|albert heijn|mercadona|boulangerie|bakery|primeur|[eé]picerie|supermarch|fromagerie|boucherie/i,
  ],
  [
    'transport',
    /\buber\b|\bbolt\b|heetch|free ?now|\bg7\b|taxi|sncf|ratp|navigo|\btan\b|\btcl\b|\bsl\b|\bsj\b|trainline|blablacar|ouigo|\blime\b|\btier\b|dott|velib|vélib|parking|indigo|autoroute|péage|peage|totalenergies|\besso\b|\bshell\b|\bbp\b|circle k/i,
  ],
  [
    'travel',
    /airbnb|booking\.com|hotel|hôtel|hostel|expedia|ryanair|easyjet|air ?france|\bklm\b|transavia|vueling|lufthansa|\bsas\b|norwegian|eurostar|getyourguide/i,
  ],
  [
    'bills',
    /netflix|spotify|deezer|disney|canal\+|apple|google|youtube|icloud|amazon prime|prime video|free mobile|\bfree\b|orange|\bsfr\b|bouygues|sosh|\bedf\b|engie|total ?energies? ?(electricit|gaz)|veolia|assurance|insurance|alan\b|mutuelle|openai|anthropic|github|vercel|notion|revolut|impots|impôts/i,
  ],
  [
    'home',
    /\brent\b|loyer|hyra|ikea|leroy merlin|castorama|bricorama|brico|maisons du monde|conforama|darty|boulanger\b|\bbut\b|habitat/i,
  ],
  [
    'health',
    /pharmac|apotek|docteur|\bdr\b|m[ée]decin|dentist|doctolib|optic|opticien|basic.?fit|fitness|\bgym\b|neoness|on air|coiffeur|hair|barber|sephora|nocib|osteo/i,
  ],
  [
    'fun',
    /cin[ée]ma|\bugc\b|path[ée]|gaumont|\bmk2\b|steam|playstation|nintendo|xbox|ticketmaster|fnac spectacles|dice\.fm|museum|museo|mus[ée]e|concert|bowling|th[ée][aâ]tre|theatre/i,
  ],
  [
    'shopping',
    /amazon|amzn|fnac|decathlon|zara|h&m|uniqlo|zalando|vinted|ebay|primark|action\b|kiabi|galeries lafayette|printemps|cultura|apple store/i,
  ],
]

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
]

/** The category Tillroll guesses, from the kind of movement, the store name and the merchant code. */
export function guessCategory(transaction: Transaction): BuiltInCategory {
  const { kind, description, mcc } = transaction
  if (kind === 'income') return 'income'
  if (kind === 'topup' || kind === 'exchange') return 'transfers'
  if (kind === 'atm') return 'cash'
  const keyword = KEYWORDS.find(([, pattern]) => pattern.test(description))
  if (keyword) return keyword[0]
  if (kind === 'transfer') return 'transfers'
  if (kind === 'fee') return 'bills'
  const code = Number(mcc)
  const range = mcc ? MCC_RANGES.find(([from, to]) => code >= from && code <= to) : undefined
  return range?.[2] ?? 'other'
}

/** The category picked by hand for the store, if it still exists, or the guess. */
export function categoryOf(transaction: Transaction, key: string, rules: Rules, categories: Categories): CategoryKey {
  const picked = rules[key]
  return picked && categories.byKey[picked] ? picked : guessCategory(transaction)
}
